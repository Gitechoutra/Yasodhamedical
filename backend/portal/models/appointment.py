from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Appointment(db.Model):
    __tablename__ = "appointments"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=False)
    # Unassigned until a doctor from that department picks it up (start_appointment).
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=True)
    status = db.Column(
        db.Enum("waiting", "in_progress", "completed", "cancelled", name="appointment_status"),
        nullable=False,
        default="waiting",
    )
    reason = db.Column(db.Text, nullable=True)
    # How the OP was paid for, recorded by reception on creation. No separate
    # paid/unpaid boolean -- NULL *is* unpaid, a value *is* paid.
    payment_type = db.Column(
        db.Enum("cash", "upi", "card", name="appointment_payment_type"), nullable=True
    )
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    patient = db.relationship("Patient")
    department = db.relationship("Department")
    doctor = db.relationship("Doctor")
    consultation = db.relationship("Consultation")

    @property
    def code(self):
        """Human-facing OP number, e.g. OP0123."""
        return f"OP{self.id:04d}"

    def to_dict(self, queue_number=None):
        patient = self.patient
        return {
            "id": self.id,
            "code": self.code,
            "patient_id": self.patient_id,
            # Flat name kept for existing callers; `patient_detail` carries
            # what the queue cards render (photo, age, code).
            "patient": patient.name if patient else None,
            "patient_op_status": patient.op_status if patient else None,
            "patient_detail": (
                {
                    "id": patient.id,
                    "code": patient.code,
                    "name": patient.name,
                    "age": patient.age,
                    "gender": patient.gender,
                    "photo_url": patient.photo_url,
                    # Whose queue this is, independent of `doctor` above --
                    # that one is null until the consultation actually starts,
                    # but the assigned doctor is who this OP belongs to from
                    # the moment it's raised (see queue_helper.op_department_for).
                    "assigned_doctor": (
                        {
                            "id": patient.assigned_doctor.id,
                            "name": (
                                patient.assigned_doctor.user.name
                                if patient.assigned_doctor.user
                                else None
                            ),
                            "specialization": patient.assigned_doctor.specialization,
                            "department_id": patient.assigned_doctor.department_id,
                            "department": (
                                patient.assigned_doctor.department.name
                                if patient.assigned_doctor.department
                                else None
                            ),
                        }
                        if patient.assigned_doctor
                        else None
                    ),
                }
                if patient
                else None
            ),
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "consultation_id": self.consultation_id,
            "status": self.status,
            "reason": self.reason,
            "payment_type": self.payment_type,
            # Position in the waiting queue, assigned by the listing route;
            # None for an appointment already in consultation.
            "queue_number": queue_number,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<Appointment {self.id} {self.status}>"

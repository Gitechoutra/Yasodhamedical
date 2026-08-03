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
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    patient = db.relationship("Patient")
    department = db.relationship("Department")
    doctor = db.relationship("Doctor")
    consultation = db.relationship("Consultation")

    def to_dict(self, queue_number=None):
        patient = self.patient
        return {
            "id": self.id,
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
            # Position in the waiting queue, assigned by the listing route;
            # None for an appointment already in consultation.
            "queue_number": queue_number,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<Appointment {self.id} {self.status}>"

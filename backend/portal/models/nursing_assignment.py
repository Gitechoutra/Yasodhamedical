"""A doctor handing a patient to a nurse for the observation period.

After a consultation, surgery or procedure the doctor names the nurse who
will watch the patient for the next couple of days. That assignment is what
scopes everything else in the nursing module: a nurse sees exactly the
patients they hold an active assignment for, and every medication log,
observation, note and alert hangs off one of these rows.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

CARE_TYPES = ("observation", "post_surgery", "post_procedure", "recovery")
ASSIGNMENT_STATUSES = ("active", "completed", "cancelled")


class NursingAssignment(db.Model):
    __tablename__ = "nursing_assignments"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=False)
    # The doctor who is responsible for the patient and for this hand-off.
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)
    # The visit this recovery period follows, when there was one. Optional
    # because a nurse can also be assigned for a procedure booked outside the
    # consultation flow.
    consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=True
    )

    care_type = db.Column(
        db.Enum(*CARE_TYPES, name="nursing_care_type"),
        nullable=False,
        default="observation",
    )
    # What the doctor wants done: the treatment plan in the doctor's words,
    # plus standing instructions the nurse works from each shift.
    treatment_plan = db.Column(db.Text, nullable=True)
    care_instructions = db.Column(db.Text, nullable=True)

    starts_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    # When observation is expected to end — typically 2-3 days out. The doctor
    # can extend it; the assignment stays active until explicitly closed, so an
    # overrun never silently drops a patient off the nurse's list.
    ends_at = db.Column(db.DateTime, nullable=True)

    status = db.Column(
        db.Enum(*ASSIGNMENT_STATUSES, name="nursing_assignment_status"),
        nullable=False,
        default="active",
    )
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now())
    updated_at = db.Column(
        db.TIMESTAMP, server_default=db.func.now(), onupdate=db.func.now()
    )

    patient = db.relationship("Patient")
    nurse = db.relationship("Nurse")
    doctor = db.relationship("Doctor")
    consultation = db.relationship("Consultation")

    medication_orders = db.relationship(
        "MedicationOrder",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="MedicationOrder.id",
    )
    administrations = db.relationship(
        "MedicationAdministration",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="MedicationAdministration.created_at.desc()",
    )
    observations = db.relationship(
        "PatientObservation",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="PatientObservation.recorded_at.desc()",
    )
    notes = db.relationship(
        "NursingNote",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="NursingNote.created_at.desc()",
    )
    alerts = db.relationship(
        "ClinicalAlert",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="ClinicalAlert.created_at.desc()",
    )

    __table_args__ = (
        # Both list views ask the same shape of question: "my active
        # assignments, newest first".
        db.Index("idx_nursing_assignments_nurse_status", "nurse_id", "status"),
        db.Index("idx_nursing_assignments_doctor_status", "doctor_id", "status"),
    )

    @property
    def is_overdue(self):
        """Still active past the date the doctor set for it — needs a decision:
        discharge the patient or extend the watch."""
        return bool(
            self.status == "active" and self.ends_at and self.ends_at < datetime.utcnow()
        )

    @property
    def open_alert_count(self):
        return sum(1 for a in self.alerts if a.status == "open")

    def compliance(self):
        """Medication compliance over the whole assignment.

        Counted from what the nurse actually logged, because a dose nobody
        recorded is not evidence of anything — 'missed' and 'skipped' are
        deliberate entries, not gaps.
        """
        counts = {"completed": 0, "delayed": 0, "missed": 0, "skipped": 0}
        for record in self.administrations:
            if record.status in counts:
                counts[record.status] += 1
        total = sum(counts.values())
        # Delayed doses were still given, so they count as taken; only missed
        # and skipped are a break in the course.
        given = counts["completed"] + counts["delayed"]
        return {
            **counts,
            "total": total,
            "rate": round(given / total * 100) if total else None,
        }

    def to_dict(self, include_detail=False):
        data = {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient": self.patient.name if self.patient else None,
            "patient_code": self.patient.code if self.patient else None,
            "patient_photo_url": self.patient.photo_url if self.patient else None,
            "nurse_id": self.nurse_id,
            "nurse": self.nurse.user.name if self.nurse and self.nurse.user else None,
            "doctor_id": self.doctor_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "consultation_id": self.consultation_id,
            "care_type": self.care_type,
            "status": self.status,
            "starts_at": to_utc_iso(self.starts_at),
            "ends_at": to_utc_iso(self.ends_at),
            "completed_at": to_utc_iso(self.completed_at),
            "created_at": to_utc_iso(self.created_at),
            "is_overdue": self.is_overdue,
            "open_alerts": self.open_alert_count,
            "compliance": self.compliance(),
        }

        if include_detail:
            data["patient_detail"] = self.patient.to_dict() if self.patient else None
            data["treatment_plan"] = self.treatment_plan
            data["care_instructions"] = self.care_instructions
            data["medication_orders"] = [o.to_dict() for o in self.medication_orders]
            data["administrations"] = [a.to_dict() for a in self.administrations]
            data["observations"] = [o.to_dict() for o in self.observations]
            data["notes"] = [n.to_dict() for n in self.notes]
            data["alerts"] = [a.to_dict() for a in self.alerts]
            # The doctor's own record of the visit — the nurse reads it, never
            # edits it, so it is served straight from the consultation.
            data["consultation"] = (
                {
                    "id": self.consultation.id,
                    "summary": (
                        self.consultation.summary.to_dict()
                        if self.consultation.summary
                        else None
                    ),
                    "prescriptions": [
                        p.to_dict() for p in self.consultation.prescriptions
                    ],
                    "prescription_verified": (
                        self.consultation.prescription_verified_at is not None
                    ),
                    "ended_at": to_utc_iso(self.consultation.ended_at),
                }
                if self.consultation
                else None
            )

        return data

    def __repr__(self):
        return f"<NursingAssignment {self.id} patient={self.patient_id} nurse={self.nurse_id}>"

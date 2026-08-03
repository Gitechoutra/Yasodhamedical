from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Consultation(db.Model):
    __tablename__ = "consultations"

    id = db.Column(db.Integer, primary_key=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    status = db.Column(
        db.Enum("scheduled", "in_progress", "completed", name="consultation_status"),
        nullable=False,
        default="scheduled",
    )
    started_at = db.Column(db.DateTime, nullable=True)
    ended_at = db.Column(db.DateTime, nullable=True)
    # Set when a doctor signs off the AI-suggested prescription. Cleared
    # whenever the prescription is edited, so a signature always refers to
    # the exact medicines that were reviewed.
    prescription_verified_at = db.Column(db.DateTime, nullable=True)
    prescription_verified_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    verified_by = db.relationship("User", foreign_keys=[prescription_verified_by])
    doctor = db.relationship("Doctor", back_populates="consultations")
    patient = db.relationship("Patient", back_populates="consultations")
    messages = db.relationship(
        "ConversationMessage",
        back_populates="consultation",
        order_by="ConversationMessage.created_at",
        cascade="all, delete-orphan",
    )
    summary = db.relationship(
        "ConsultationSummary",
        back_populates="consultation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    prescriptions = db.relationship(
        "GeneratedPrescription", back_populates="consultation", cascade="all, delete-orphan"
    )
    # One report per consultation (reports.consultation_id is unique).
    report = db.relationship("Report", uselist=False, viewonly=True)

    @property
    def duration_seconds(self):
        """How long the consultation ran, or None while it's still open."""
        if not self.started_at or not self.ended_at:
            return None
        return max(0, int((self.ended_at - self.started_at).total_seconds()))

    def to_dict(self, include_detail=False, include_summary=False):
        """`include_summary` adds everything the Consultations list renders;
        `include_detail` adds the full transcript on top, which is only worth
        sending for a single consultation."""
        data = {
            "id": self.id,
            "doctor_id": self.doctor_id,
            "patient_id": self.patient_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "patient": self.patient.name if self.patient else None,
            "status": self.status,
            "started_at": to_utc_iso(self.started_at),
            "ended_at": to_utc_iso(self.ended_at),
            "duration_seconds": self.duration_seconds,
            "prescription_verified": self.prescription_verified_at is not None,
            "prescription_verified_at": to_utc_iso(self.prescription_verified_at),
            "prescription_verified_by": (
                self.verified_by.name if self.verified_by else None
            ),
        }

        if include_summary or include_detail:
            data["patient_detail"] = self.patient.to_dict() if self.patient else None
            data["summary"] = self.summary.to_dict() if self.summary else None
            data["prescriptions"] = [p.to_dict() for p in self.prescriptions]
            data["report"] = (
                {"id": self.report.id, "generated_at": to_utc_iso(self.report.generated_at)}
                if self.report
                else None
            )

        if include_detail:
            data["messages"] = [m.to_dict() for m in self.messages]

        return data

    def __repr__(self):
        return f"<Consultation {self.id} {self.status}>"

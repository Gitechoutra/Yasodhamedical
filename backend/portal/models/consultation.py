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
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now())

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

    def to_dict(self, include_detail=False):
        data = {
            "id": self.id,
            "doctor_id": self.doctor_id,
            "patient_id": self.patient_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "patient": self.patient.name if self.patient else None,
            "status": self.status,
            "started_at": to_utc_iso(self.started_at),
            "ended_at": to_utc_iso(self.ended_at),
        }

        if include_detail:
            data["patient_detail"] = self.patient.to_dict() if self.patient else None
            data["messages"] = [m.to_dict() for m in self.messages]
            data["summary"] = self.summary.to_dict() if self.summary else None
            data["prescriptions"] = [p.to_dict() for p in self.prescriptions]

        return data

    def __repr__(self):
        return f"<Consultation {self.id} {self.status}>"

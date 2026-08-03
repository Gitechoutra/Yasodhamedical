from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=False, unique=True
    )
    file_path = db.Column(db.String(255), nullable=False)
    generated_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    consultation = db.relationship("Consultation")

    def to_dict(self):
        consultation = self.consultation
        return {
            "id": self.id,
            "consultation_id": self.consultation_id,
            "patient": consultation.patient.name if consultation and consultation.patient else None,
            "doctor": (
                consultation.doctor.user.name
                if consultation and consultation.doctor and consultation.doctor.user
                else None
            ),
            "generated_at": to_utc_iso(self.generated_at),
        }

    def __repr__(self):
        return f"<Report consultation={self.consultation_id}>"

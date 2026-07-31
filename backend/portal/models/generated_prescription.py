from portal.extensions import db


class GeneratedPrescription(db.Model):
    __tablename__ = "generated_prescriptions"

    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=False)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    medicine_name = db.Column(db.String(150), nullable=False)
    # Gemini writes these as free text (e.g. "Twice daily after meals for the
    # first week, then once daily"), which can run longer than a short code
    # like "BID" — sized generously rather than truncating clinical instructions.
    dose = db.Column(db.String(255), nullable=True)
    frequency = db.Column(db.String(255), nullable=True)
    duration = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now())

    consultation = db.relationship("Consultation", back_populates="prescriptions")
    medicine = db.relationship("Medicine")

    def to_dict(self):
        return {
            "id": self.id,
            "medicine_name": self.medicine_name,
            "dose": self.dose,
            "frequency": self.frequency,
            "duration": self.duration,
            "matched_formulary": self.medicine_id is not None,
        }

    def __repr__(self):
        return f"<GeneratedPrescription {self.medicine_name}>"

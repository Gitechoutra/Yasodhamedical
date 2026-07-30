from datetime import date

from portal.extensions import db


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    gender = db.Column(db.Enum("male", "female", "other", name="patient_gender"), nullable=True)
    dob = db.Column(db.Date, nullable=True)
    # Bare filename inside uploads/patients, same convention as users.avatar_path.
    photo_path = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(150), nullable=True)
    blood_group = db.Column(db.String(5), nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    medical_history = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now())
    updated_at = db.Column(
        db.TIMESTAMP, server_default=db.func.now(), onupdate=db.func.now()
    )

    consultations = db.relationship("Consultation", back_populates="patient")

    @property
    def code(self):
        """Human-facing patient ID, e.g. PAT0004."""
        return f"PAT{self.id:04d}"

    @property
    def age(self):
        """Whole years, or None when no date of birth is on file."""
        if not self.dob:
            return None
        today = date.today()
        # Subtract a year when this year's birthday hasn't happened yet.
        return today.year - self.dob.year - ((today.month, today.day) < (self.dob.month, self.dob.day))

    @property
    def photo_url(self):
        return f"/api/patients/photo/{self.photo_path}" if self.photo_path else None

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "gender": self.gender,
            "dob": self.dob.isoformat() if self.dob else None,
            "age": self.age,
            "photo_url": self.photo_url,
            "phone": self.phone,
            "email": self.email,
            "blood_group": self.blood_group,
            "allergies": self.allergies,
            "medical_history": self.medical_history,
        }

    def __repr__(self):
        return f"<Patient {self.name}>"

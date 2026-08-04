from datetime import date, datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    gender = db.Column(db.Enum("male", "female", "other", name="patient_gender"), nullable=True)
    dob = db.Column(db.Date, nullable=True)
    # Bare filename inside uploads/patients, same convention as users.avatar_path.
    photo_path = db.Column(db.String(255), nullable=True)
    # The doctor this patient belongs to. Front desk picks them at
    # registration based on the condition; only that doctor (and
    # admin/reception) can see the patient afterwards.
    assigned_doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(150), nullable=True)
    blood_group = db.Column(db.String(5), nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    medical_history = db.Column(db.Text, nullable=True)
    # OP (out-patient) registration status for this patient's most recent OP:
    # 'paid' on their very first registration, then 'free' if they register
    # again within 15 days (follow-up), 'paid' otherwise.
    op_status = db.Column(db.Enum("free", "paid", name="op_status"), nullable=True)
    last_registered_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    consultations = db.relationship("Consultation", back_populates="patient")
    assigned_doctor = db.relationship("Doctor", foreign_keys=[assigned_doctor_id])

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
            "assigned_doctor_id": self.assigned_doctor_id,
            "assigned_doctor": (
                {
                    "id": self.assigned_doctor.id,
                    "name": self.assigned_doctor.user.name if self.assigned_doctor.user else None,
                    "specialization": self.assigned_doctor.specialization,
                    "department_id": self.assigned_doctor.department_id,
                    "department": (
                        self.assigned_doctor.department.name
                        if self.assigned_doctor.department
                        else None
                    ),
                }
                if self.assigned_doctor
                else None
            ),
            "phone": self.phone,
            "email": self.email,
            "blood_group": self.blood_group,
            "allergies": self.allergies,
            "medical_history": self.medical_history,
            "op_status": self.op_status,
            "last_registered_at": to_utc_iso(self.last_registered_at),
        }

    def __repr__(self):
        return f"<Patient {self.name}>"

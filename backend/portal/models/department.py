from datetime import datetime

from portal.extensions import db


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    doctors = db.relationship("Doctor", back_populates="department")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "doctor_count": len(self.doctors)}

    def __repr__(self):
        return f"<Department {self.name}>"

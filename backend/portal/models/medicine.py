from datetime import datetime

from portal.extensions import db


class Medicine(db.Model):
    __tablename__ = "medicines"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    default_dose = db.Column(db.String(255), nullable=True)
    default_frequency = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "default_dose": self.default_dose,
            "default_frequency": self.default_frequency,
        }

    def __repr__(self):
        return f"<Medicine {self.name}>"

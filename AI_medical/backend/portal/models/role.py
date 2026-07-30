from portal.extensions import db


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now())

    users = db.relationship("User", back_populates="role")

    def __repr__(self):
        return f"<Role {self.name}>"

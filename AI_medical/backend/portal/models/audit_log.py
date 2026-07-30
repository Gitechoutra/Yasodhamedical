from portal.extensions import db


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = db.Column(db.String(100), nullable=False)
    entity = db.Column(db.String(100), nullable=True)
    entity_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now())

    def __repr__(self):
        return f"<AuditLog {self.action} {self.entity}:{self.entity_id}>"

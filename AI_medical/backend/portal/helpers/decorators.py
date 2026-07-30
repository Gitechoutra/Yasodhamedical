from functools import wraps

from flask_jwt_extended import get_jwt, verify_jwt_in_request

from portal.helpers.response import error


def role_required(*allowed_roles):
    """Restricts a route to users whose JWT `role` claim is in allowed_roles.

    Must be stacked under a route that also needs jwt_required(); this
    decorator calls verify_jwt_in_request() itself so it can be used alone.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in allowed_roles:
                return error("Forbidden: insufficient role", status=403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator

const checkRole = (roles) => (req, res, next) => {
  const userRole = req.user.role; // Assuming the user's role is stored in req.user after token verification

  if (roles.includes(userRole)) {
    next(); // User has one of the required roles, so proceed to the next middleware/route handler
  } else {
    res.status(403).json({ message: 'Access denied: Insufficient permissions' });
  }
};

module.exports = checkRole;

const checkRole = (roles) => (req, res, next) => {
  const userRole = req.user.role;

  if (roles.includes(userRole)) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Insufficient permissions' });
  }
};

module.exports = checkRole;

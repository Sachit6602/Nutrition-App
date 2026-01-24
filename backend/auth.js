import bcrypt from 'bcrypt';
import { getUserByEmail, createUser, getUserById } from './db.js';

// Hash password
export const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Verify password
export const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Authentication middleware (uses session)
export const authenticate = (req, res, next) => {
  // Check if user is logged in via session
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated. Please login first.' });
  }
  
  // Verify user still exists
  const user = getUserById(req.session.userId);
  if (!user) {
    // Clear invalid session
    req.session.destroy();
    return res.status(401).json({ error: 'User not found' });
  }
  
  req.userId = req.session.userId;
  req.user = user;
  next();
};

// Register user
export const register = async (req, res) => {
  try {
    console.log('Registration request received:', { email: req.body?.email });
    console.log('Request body keys:', Object.keys(req.body || {}));
    
    // Ensure we have a valid request body
    if (!req.body) {
      console.log('No request body received');
      return res.status(400).json({ error: 'Request body is required' });
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if user already exists
    console.log('Checking if user exists...');
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password and create user
    console.log('Hashing password...');
    const passwordHash = await hashPassword(password);
    console.log('Password hashed, creating user...');
    const user = createUser(email, passwordHash);
    console.log('User created:', user.id);
    
    // Create session
    if (!req.session) {
      console.error('Session not available!');
      return res.status(500).json({ error: 'Session not available' });
    }
    
    req.session.userId = user.id;
    req.session.email = user.email;
    console.log('Session created for user:', user.id);
    
    console.log('Sending success response...');
    const response = {
      success: true,
      user: {
        id: user.id,
        email: user.email
      },
      message: 'Registration successful'
    };
    
    res.status(201).json(response);
    console.log('Response sent successfully');
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error stack:', error.stack);
    
    // Make sure we send a response even if there's an error
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Logout user
export const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid'); // Clear session cookie
    res.json({ success: true, message: 'Logout successful' });
  });
};

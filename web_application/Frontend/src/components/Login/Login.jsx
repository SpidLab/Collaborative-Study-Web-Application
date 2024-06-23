import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { TextField, Button, Container, Typography, Box, CircularProgress, Divider, styled, IconButton, InputAdornment } from '@mui/material';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import './Login.css';

const WhiteButton = styled(Button)({
  background: '#fff',
  color: '#1976d2',
  border: '1px solid #1976d2',
  '&:hover': {
    background: '#1976d2',
    color: '#fff',
  },
});

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in, if yes, redirect to home page
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/');
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post('http://127.0.0.1:5000/api/login', {
        email: username,
        password,
      });

      if (response.data.message === 'Login successful' && response.data.token) {
        localStorage.setItem('token', response.data.token); // Store token in localStorage
        onLogin(); // Set isLoggedIn to true in App component
        navigate('/'); // Redirect to the home page upon successful login
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword((prevShowPassword) => !prevShowPassword);
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box sx={{ marginTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ border: '1px dashed #ccc', borderRadius: 5, padding: 3, width: '100%', boxSizing: 'border-box', marginTop: 3 }}>
          <Typography variant="h5" align="center" gutterBottom>Welcome back, Login</Typography>
          <form onSubmit={handleLogin}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleTogglePasswordVisibility}>
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            {error && (
              <Typography variant="body2" color="error" sx={{ mt: 1, mb: 1 }}>
                {error}
              </Typography>
            )}
            <Button type="submit" fullWidth variant="contained" color="primary" disabled={loading} sx={{ mt: 3, mb: 2 }}>
              {loading ? <CircularProgress size={24} /> : 'Login'}
            </Button>
            <GoogleLogin sx={{ mb: 1 }} />
            <Divider sx={{ mb: 1 }}>or</Divider>
            <Button component={RouterLink} to="/forgot/password" fullWidth variant="text" color="primary" sx={{ mb: 1 }}>
              Forgot Password?
            </Button>
          </form>
          <Divider sx={{ mt: 2, mb: 1 }}>Don't have an account?</Divider>
          <WhiteButton component={RouterLink} to="/register" fullWidth variant="outlined">
            Register New Account
          </WhiteButton>
        </Box>
      </Box>
    </Container>
  );
};

export default Login;
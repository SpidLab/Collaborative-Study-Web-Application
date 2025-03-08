import React, { useState } from 'react';
import { TextField, Button, Container, Typography, Box, CircularProgress, styled, Divider, InputAdornment, IconButton } from '@mui/material';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import URL from '../../config';

const WhiteButton = styled(Button)({
  background: '#fff',
  color: '#1976d2',
  border: '1px solid #1976d2',
  '&:hover': {
    background: '#1976d2',
    color: '#fff',
  },
});

const StyledTextField = styled(TextField)({
  '& .MuiFilledInput-root': {
    backgroundColor: '#f2f2f2',
  },
  '& .MuiFilledInput-underline:after': {
    borderBottomColor: '#1976d2',
  },
});

const NewUser = () => {
  const [username, setUsername] = useState('');
  const [name, setName] = useState(''); // Added state for name
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(''); // Added state for success message
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${URL}/api/register`, {
        name,  // Include name in the request
        email: username,
        password,
      });

      console.log('Response:', response.data); // Debugging
      setError('');
      setSuccess('Registration complete! Verify your email to get started.'); // Set success message
      // Clear form fields
      setUsername('');
      setName(''); // Clear name field
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error:', err.response?.data?.message || 'An error occurred');
      console.error('Error headers:', err.response?.headers); // Debugging
      setError(err.response?.data?.message || 'An error occurred');
      setSuccess(''); // Clear success message on error
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword((prevShowPassword) => !prevShowPassword);
  };

  const handleConfirmPasswordChange = (e) => {
    setConfirmPassword(e.target.value);
  };

  return (
    <Container component="div" maxWidth="xs" sx={{ marginTop: 4 }}>
      <Box sx={{ border: '1px dashed #ccc', borderRadius: 5, padding: 3, width: '100%', boxSizing: 'border-box', marginTop: 3 }}>
        <Typography variant="h5" align="center" gutterBottom>Registration</Typography>
        <form onSubmit={handleSubmit}>
          <StyledTextField
            fullWidth
            required
            value={name}
            onChange={(e) => setName(e.target.value)} // Handle name input
            id="name"
            label="Name"
            margin="normal"
          />
          <StyledTextField
            fullWidth
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            id="username"
            label="Email"
            margin="normal"
          />
          <StyledTextField
            fullWidth
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            margin="normal"
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
          <StyledTextField
            fullWidth
            required
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            id="confirm-password"
            label="Confirm Password"
            type={showPassword ? 'text' : 'password'}
            margin="normal"
          />
          {error && <Typography variant="body2" color="error" sx={{ mt: 1, mb: 1 }}>{error}</Typography>}
          {success && <Typography variant="body2" color="success" sx={{ mt: 1, mb: 1 }}>{success}</Typography>}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            disabled={loading}
            sx={{ mt: 3, mb: 2 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Submit'}
          </Button>
        </form>
        <Divider sx={{ mb: 1 }}>Already have an account?</Divider>
        <WhiteButton component={RouterLink} to="/login" fullWidth variant="outlined">
          <Typography variant="body1" align="center">Login here</Typography>
        </WhiteButton>
      </Box>
    </Container>
  );
};

export default NewUser;

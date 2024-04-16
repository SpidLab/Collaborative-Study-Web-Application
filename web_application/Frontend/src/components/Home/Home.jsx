import React from 'react';
import { Button, Typography, Box } from '@mui/material';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <Box sx={{ textAlign: 'center', mt: 10 }}>
      <Typography variant="h4" gutterBottom>
        Welcome to the app
      </Typography>
      <Button component={Link} to="/login" variant="contained" color="primary" sx={{ mr: 2 }}>
        Login
      </Button>
      <Button component={Link} to="/register" variant="contained" color="secondary">
        Register
      </Button>
    </Box>
  );
};

export default HomePage;

import React, { useState } from 'react';
import {Link, TextField, Button, Container, Typography } from '@mui/material';
import { GoogleLogin } from '@react-oauth/google';

import "./Login.css";

const Login = () => {

  const responseMessage = (response) => {
    console.log(response);
  };
  const errorMessage = (error) => {
      console.log(error);
  };

  return (
    <Container component="div" maxWidth="sm" sx={{ marginTop: 4 }}>
      <form>
        <Typography variant="h3" align="center" gutterBottom>Login</Typography>
        <Typography variant="h5" align="center" gutterBottom>Sign into your account</Typography>
        
        <TextField
          fullWidth
          // required
          id="filled-required"
          label="Username"
          variant="filled"
          margin="normal"
        />
        <TextField
          fullWidth
          id="filled-password-input"
          label="Password"
          type="password"
          autoComplete="current-password"
          variant="filled"
          margin="normal"
        />
        <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ marginTop: 2 }}>
            Login
        </Button>
        <div className="google_btn">
          <GoogleLogin onSuccess={responseMessage} onError={errorMessage} />
        </div>

        <Link className="google_btn" href="#">Forgot Username or Password?</Link>
        
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ marginTop: 2 }}
        >
          Register New Account
        </Button>
      </form>
    </Container>    
  );
};

export default Login;

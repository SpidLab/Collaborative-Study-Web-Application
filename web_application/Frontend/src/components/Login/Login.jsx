import React, { useState } from 'react';
import {Link, TextField, Button, Container, Typography } from '@mui/material';
import { GoogleLogin } from '@react-oauth/google';

import "./Login.css";

const Login = () => {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('')



  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.status === 200) {
        // Redirect to the homepage or set a token in local storage/session storage
        window.location.href = data.redirect;
      } else {
        // Handle errors
        setErrorMessage(data.message);
      }
    } catch (error) {
      // Handle network errors
      setErrorMessage('Incorrect Login');
    }
  };

  const responseMessageGoogle = (response) => {
    console.log(response);
  };
  const errorMessageGoogle = (error) => {
      console.log(error);
  };

  return (
    <Container component="div" maxWidth="sm" sx={{ marginTop: 4 }}>
      <form onSubmit={handleSubmit}>
        <Typography variant="h3" align="center" gutterBottom>Login</Typography>
        <Typography variant="h5" align="center" gutterBottom>Sign into your account</Typography>
        
        <TextField
          fullWidth
          // required
          id="filled-required"
          label="Username"
          variant="filled"
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <TextField
          fullWidth
          id="filled-password-input"
          label="Password"
          type="password"
          autoComplete="current-password"
          variant="filled"
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ marginTop: 2 }}>
            Login
        </Button>
        {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
        <div className="google_btn">
          <GoogleLogin onSuccess={responseMessageGoogle} onError={errorMessageGoogle} />
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

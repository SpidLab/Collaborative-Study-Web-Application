import React from 'react';
import {Link, TextField, Button, Container, Typography } from '@mui/material';


const NewUser = () => {


  return (
    <Container component="div" maxWidth="sm" sx={{ marginTop: 4 }}>
      <form>
        <Typography variant="h3" align="center" gutterBottom>New User</Typography>
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
        <TextField
          fullWidth
          id="filled-password-input"
          label="Confirm Password"
          type="password"
          autoComplete="current-password"
          variant="filled"
          margin="normal"
        />

      </form>
    </Container>    
  );
};

export default NewUser;
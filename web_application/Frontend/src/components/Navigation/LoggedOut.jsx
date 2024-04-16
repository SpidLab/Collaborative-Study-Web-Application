import React from 'react';
import { Button } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

const LoggedOut = ({ onLogin }) => {
  return (
    <>
      <Button color="inherit" component={RouterLink} to="/">
        Home
      </Button>
      <Button color="inherit" component={RouterLink} to="/login" onClick={onLogin}>
        Login
      </Button>
    </>
  );
};

export default LoggedOut;

import React from 'react';
import { Button, IconButton, Tooltip, Avatar, Menu, MenuItem } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import PersonIcon from '@mui/icons-material/Person';
import axios from 'axios';

export default function LoggedIn({ onLogout }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      // Call the logout API endpoint
      await axios.post('https://ubiquitous-space-potato-q77r667x74qx29vvr-5000.app.github.dev/api/logout');
      // Remove token from localStorage
      localStorage.removeItem('token');
      onLogout();
      return <Navigate to="/login" />;
      // Redirect to login page after successful logout
    } catch (error) {
      // Handle any errors
      console.error('Logout error:', error);
    } finally {
      // Close the menu
      handleClose();
    }
  };  
  
  

  return (
    <>
      <Button color="inherit" component={RouterLink} to="/">
        Home
      </Button>
      <Button color="inherit" component={RouterLink} to="/upload">
        Upload
      </Button>
      <Button color="inherit" component={RouterLink} to="/search">
        Search
      </Button>
      <Button color="inherit" component={RouterLink} to="/session">
        Session
      </Button>
      <Tooltip title="Account settings">
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{ ml: 2 }}
          aria-controls={open ? 'account-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <PersonIcon />
        </IconButton>
      </Tooltip>
      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <MenuItem onClick={handleLogout}>Logout</MenuItem>
        <MenuItem component={RouterLink} to="/collaboration" onClick={handleClose}>
          Collaboration
        </MenuItem>
      </Menu>
    </>
  );
}

import React from 'react';
import { Button, IconButton, Tooltip, Avatar, Menu, MenuItem } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import PersonIcon from '@mui/icons-material/Person';

export default function AccountMenu({ onLogout }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    onLogout();
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

import React, { useEffect, useState } from 'react';
import { Button, IconButton, Tooltip, Avatar, Menu, MenuItem, Badge } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import PersonIcon from '@mui/icons-material/Person';
import axios from 'axios';
import URL from '../../config';

export default function LoggedIn({ onLogout }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const open = Boolean(anchorEl);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${URL}/api/invitations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const invitations = response.data.invitations;
        const userId = response.data.user_id; 
        const pendingInvitations = invitations.filter(invitation => 
          invitation.status === 'pending' && invitation.receiver_id === userId
        );
        setPendingCount(pendingInvitations.length);
      } catch (error) {
        console.error('Error fetching pending invitations:', error);
      }
    };

    fetchPendingCount();
  }, []);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      // Call the logout API endpoint
      await axios.post(`${URL}/api/logout`);
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
      <Badge badgeContent={pendingCount} color="error">
        <Button color="inherit" component={RouterLink} to="/collaboration">
          Collaboration
        </Button>
      </Badge>
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
        <MenuItem component={RouterLink} to="/" onClick={handleClose}>
          Edit Profile
        </MenuItem>
        <MenuItem component={RouterLink} to="/" onClick={handleClose}>
          Change Password
        </MenuItem>
        <MenuItem onClick={handleLogout}>Logout</MenuItem>
      </Menu>
    </>
  );
}



// import React from 'react';
// import { Button, IconButton, Tooltip, Avatar, Menu, MenuItem } from "@mui/material";
// import { Link as RouterLink } from "react-router-dom";
// import PersonIcon from '@mui/icons-material/Person';
// import axios from 'axios';
// import URL from '../../config';

// export default function LoggedIn({ onLogout }) {
//   const [anchorEl, setAnchorEl] = React.useState(null);
//   const open = Boolean(anchorEl);

//   const handleClick = (event) => {
//     setAnchorEl(event.currentTarget);
//   };

//   const handleClose = () => {
//     setAnchorEl(null);
//   };

//   const handleLogout = async () => {
//     try {
//       // Call the logout API endpoint
//       await axios.post(`${URL}/api/logout`);
//       // Remove token from localStorage
//       localStorage.removeItem('token');
//       onLogout();
//       return <Navigate to="/login" />;
//       // Redirect to login page after successful logout
//     } catch (error) {
//       // Handle any errors
//       console.error('Logout error:', error);
//     } finally {
//       // Close the menu
//       handleClose();
//     }
//   };  
  
  

//   return (
//     <>
//       <Button color="inherit" component={RouterLink} to="/">
//         Home
//       </Button>
//       <Button color="inherit" component={RouterLink} to="/upload">
//         Upload
//       </Button>
//       <Button color="inherit" component={RouterLink} to="/search">
//         Search
//       </Button>
//       <Button color="inherit" component={RouterLink} to="/collaboration">
//         Collaboration
//       </Button>
//       <Button color="inherit" component={RouterLink} to="/session">
//         Session
//       </Button>
//       <Tooltip title="Account settings">
//         <IconButton
//           onClick={handleClick}
//           size="small"
//           sx={{ ml: 2 }}
//           aria-controls={open ? 'account-menu' : undefined}
//           aria-haspopup="true"
//           aria-expanded={open ? 'true' : undefined}
//         >
//           <PersonIcon />
//         </IconButton>
//       </Tooltip>
//       <Menu
//         id="account-menu"
//         anchorEl={anchorEl}
//         open={open}
//         onClose={handleClose}
//       >
//         <MenuItem component={RouterLink} to="/" onClick={handleClose}>
//           Edit Profile
//         </MenuItem>
//         <MenuItem component={RouterLink} to="/" onClick={handleClose}>
//           Change Password
//         </MenuItem>
//         <MenuItem onClick={handleLogout}>Logout</MenuItem>
//       </Menu>
//     </>
//   );
// }

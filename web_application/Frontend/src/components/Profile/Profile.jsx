import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, TextField, Button, Typography, Box } from '@mui/material';
import URL from '../../config';



const Profile = () => {
  const getToken = () => {
    return localStorage.getItem('token');
  };
  const token = getToken();
  
  const [user, setUser] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  // "Connect my computer": one-time code the collaborator pastes into the local agent.
  const [agentCode, setAgentCode] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnectComputer = async () => {
    setAgentBusy(true);
    setCopied(false);
    try {
      const response = await axios.post(`${URL}/api/agent/enrollment-code`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAgentCode(response.data.code);
    } catch (error) {
      console.error('Could not generate connection code', error);
      alert('Sorry, we could not generate a code. Please try again.');
    } finally {
      setAgentBusy(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(agentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      /* clipboard may be blocked; the user can still select the text manually */
    }
  };

  useEffect(() => {
    axios.get(`${URL}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => {
        setUser(prevState => ({
          ...prevState,
          email: response.data.email,
          name: response.data.name
        }));
      })
      .catch(error => {
        console.error('There was an error fetching the user data!', error);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUser(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    axios.put(`${URL}/api/profile`, user, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => {
        if (response.status === 200) {
          alert('Profile updated successfully!');
          setUser({
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: '',
          });
        }
      })
      .catch(error => {
        console.error('There was an error updating the profile!', error);
        alert(error.response.data.message);
      });
  };


  return (
    <Container maxWidth="sm" sx={{ marginTop: 5 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Edit Profile
      </Typography>
      <form onSubmit={handleSubmit}>
        <Box mb={2}>
          <TextField
            fullWidth
            label="Name"
            variant="outlined"
            id="name"
            name="name"
            value={user.name}
            onChange={handleChange}
          />
        </Box>
        <Box mb={2}>
          <TextField
            fullWidth
            label="Email"
            variant="outlined"
            id="email"
            name="email"
            value={user.email}
            InputProps={{
              readOnly: true,
            }}
          />
        </Box>
        <Box mb={2}>
          <TextField
            fullWidth
            label="Current Password"
            variant="outlined"
            type="password"
            id="currentPassword"
            name="currentPassword"
            value={user.currentPassword}
            onChange={handleChange}
          />
        </Box>
        <Box mb={2}>
          <TextField
            fullWidth
            label="New Password"
            variant="outlined"
            type="password"
            id="newPassword"
            name="newPassword"
            value={user.newPassword}
            onChange={handleChange}
          />
        </Box>
        <Box mb={2}>
          <TextField
            fullWidth
            label="Confirm New Password"
            variant="outlined"
            type="password"
            id="confirmNewPassword"
            name="confirmNewPassword"
            value={user.confirmNewPassword}
            onChange={handleChange}
          />
        </Box>
        <Button variant="contained" color="primary" type="submit">
          Update Profile
        </Button>
      </form>

      <Box mt={6} p={3} sx={{ border: '1px solid #e0e0e0', borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Connect my computer
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Get a one-time code, then paste it into the setup helper on your computer.
          The code is valid for 24 hours.
        </Typography>

        <Button variant="outlined" onClick={handleConnectComputer} disabled={agentBusy}>
          {agentBusy ? 'Generating…' : 'Generate connection code'}
        </Button>

        {agentCode && (
          <Box mt={2}>
            <TextField
              fullWidth
              multiline
              label="Your connection code"
              value={agentCode}
              InputProps={{ readOnly: true }}
              onFocus={(e) => e.target.select()}
            />
            <Button size="small" sx={{ mt: 1 }} onClick={handleCopyCode}>
              {copied ? 'Copied!' : 'Copy code'}
            </Button>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default Profile;

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Divider, Button, TextField, List, ListItem, ListItemText, IconButton } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import axios from 'axios';
import URL from '../../config';

const CollaborationDetails = () => {
  const { uuid } = useParams();
  const [collaboration, setCollaboration] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [newExperiment, setNewExperiment] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    const fetchCollaborationDetails = async () => {
      try {
        const response = await axios.get(`${URL}/api/collaboration/${uuid}`);
        setCollaboration(response.data);
        setExperiments(response.data.experiments || []);
        determineUserRole(response.data);
      } catch (error) {
        console.error('Error fetching collaboration details:', error);
      }
    };

    fetchCollaborationDetails();
  }, [uuid]);

  const determineUserRole = (data) => {
    const userId = localStorage.getItem('userId');
    if (data.creator_id === userId) {
      setRole('sender');
    } else if (data.invited_users.some(user => user.user_id === userId)) {
      setRole('receiver');
    }
  };

  const handleAddExperiment = () => {
    if (newExperiment.trim()) {
      setExperiments([...experiments, newExperiment]);
      setNewExperiment('');
    }
  };

  const handleDeleteExperiment = (index) => {
    const updatedList = experiments.filter((_, i) => i !== index);
    setExperiments(updatedList);
  };

  const handleUpdateCollaboration = async () => {
    try {
      await axios.post(`${URL}/api/collaboration/${uuid}`, { experiments }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      alert('Collaboration updated successfully!');
    } catch (error) {
      console.error('Error updating collaboration:', error);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
        Collaboration Details
      </Typography>
      <Divider sx={{ mb: 4 }} />

      {role === 'sender' && (
        <>
          <Typography variant="h6">Manage Experiments</Typography>
          <TextField
            label="New Experiment"
            variant="outlined"
            fullWidth
            margin="normal"
            value={newExperiment}
            onChange={(e) => setNewExperiment(e.target.value)}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={handleAddExperiment}
          >
            Add Experiment
          </Button>
          <List>
            {experiments.map((experiment, index) => (
              <ListItem key={index}>
                <ListItemText primary={experiment} />
                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteExperiment(index)}>
                  <Delete />
                </IconButton>
              </ListItem>
            ))}
          </List>
          <Button variant="contained" color="success" onClick={handleUpdateCollaboration}>
            Update Collaboration
          </Button>
        </>
      )}

      {role === 'receiver' && (
        <>
          <Typography variant="h6">Upload Data</Typography>
          {/* Add file upload components and invitation status update logic here */}
        </>
      )}
    </Box>
  );
};

export default CollaborationDetails;
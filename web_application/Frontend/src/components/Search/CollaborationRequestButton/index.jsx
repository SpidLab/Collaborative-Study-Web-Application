import React from 'react';
import { Button } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

const CollaborationRequestButton = ({ onClick }) => {
  return (
    <Button 
      variant="contained" 
      color="primary" 
      startIcon={<SendIcon />} 
      onClick={onClick}
    >
      Send Request
    </Button>
  );
};

export default CollaborationRequestButton;

import React from 'react';
import { List } from '@mui/material';
import CollaboratorItem from "../CollaboratorItem"; 

const SearchResultList = ({ collaborators, isLoading }) => {
  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (!collaborators || collaborators.length === 0) {
    return <p>No collaborators found.</p>;
  }

  return (
    <List>
      {collaborators.map((collaborator) => (
        <CollaboratorItem key={collaborator.id} collaborator={collaborator} />
      ))}
    </List>
  );
};

export default SearchResultList;

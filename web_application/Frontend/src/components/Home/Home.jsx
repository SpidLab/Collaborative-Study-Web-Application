// import React, { useState } from 'react';
// import { Button, Typography, Box, Grid, Paper, List, ListItem, ListItemText, ListItemSecondaryAction, Snackbar } from '@mui/material';
// import UploadForm from '../Upload/Upload';
// import SearchPage from '../Search/Search';

// const userInvitations = [
//   { id: 1, name: 'Dr. Emily Davis' },
//   { id: 2, name: 'Prof. Matthew Wilson' },
//   { id: 3, name: 'Prof. David Brown' },
// ];

// const UserInvitation = ({ user, onAccept, onReject }) => {
//   const [status, setStatus] = useState(null); // null, 'accepted', or 'rejected'

//   const handleAccept = () => {
//     setStatus('accepted');
//     onAccept(user.name);
//   };

//   const handleReject = () => {
//     setStatus('rejected');
//     onReject(user.name);
//   };

//   return (
//     <ListItem sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
//       <ListItemText primary={user.name} />
//       <ListItemSecondaryAction>
//         {status === 'accepted' ? (
//           <Button variant="contained" color="primary" size="small">
//             Create a session
//           </Button>
//         ) : status === 'rejected' ? (
//           <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'bold', display: 'inline-block', backgroundColor: '#f8d7da', padding: '6px 12px', borderRadius: 2 }}>
//             Rejected
//           </Typography>
//         ) : (
//           <>
//             <Button variant="contained" color="primary" size="small" sx={{ mr: 1 }} onClick={handleAccept}>
//               Accept
//             </Button>
//             <Button variant="contained" color="secondary" size="small" onClick={handleReject}>
//               Reject
//             </Button>
//           </>
//         )}
//       </ListItemSecondaryAction>
//     </ListItem>
//   );
// };

// const HomePage = () => {
//   const [message, setMessage] = useState('');
//   const [snackbarOpen, setSnackbarOpen] = useState(false);

//   const handleAccept = (userName) => {
//     setMessage(`You have accepted the invitation from ${userName}.`);
//     setSnackbarOpen(true);
//   };

//   const handleReject = (userName) => {
//     setMessage(`You have rejected the invitation from ${userName}.`);
//     setSnackbarOpen(true);
//   };

//   const handleSnackbarClose = () => {
//     setSnackbarOpen(false);
//   };

//   return (
//     <Box sx={{ textAlign: 'center', mt: 4 }}>
//       <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#333' }}>
//         Welcome Back, Jim Simons
//       </Typography>
//       <Grid container spacing={4} justifyContent="center">
//         <Grid item xs={12}>
//           <Paper sx={{ p: 4, borderRadius: 2, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
//             <Box sx={{ border: '1px solid #ccc', p: 2, borderRadius: 2 }}>
//               <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#333' }}>
//                 Search for Collaborators
//               </Typography>
//               <SearchPage />
//             </Box>
//           </Paper>
//         </Grid>
//         <Grid item xs={12} sm={6}>
//           <Paper sx={{ p: 4, borderRadius: 2, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
//             <Box sx={{ border: '1px solid #ccc', p: 2, borderRadius: 2 }}>
//               <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#333' }}>
//                 Upload Dataset
//               </Typography>
//               <UploadForm />
//             </Box>
//           </Paper>
//         </Grid>
//         <Grid item xs={12} sm={6}>
//           <Paper sx={{ p: 4, borderRadius: 2, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
//             <Box sx={{ border: '1px solid #ccc', p: 2, borderRadius: 2 }}>
//               <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#333' }}>
//                 Collaboration Invitations
//               </Typography>
//               <List>
//                 {userInvitations.map((user) => (
//                   <UserInvitation key={user.id} user={user} onAccept={handleAccept} onReject={handleReject} />
//                 ))}
//               </List>
//             </Box>
//           </Paper>
//         </Grid>
//       </Grid>
//       <Snackbar
//         open={snackbarOpen}
//         autoHideDuration={6000}
//         onClose={handleSnackbarClose}
//         message={message}
//       />
//     </Box>
//   );
// };

// export default HomePage;

import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container, Typography, Button, Box, Snackbar, Paper, Alert, Card, CardContent, Avatar, Tabs, Tab, Tooltip, Grid, Chip
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import UndoIcon from '@mui/icons-material/Undo';
import GroupIcon from '@mui/icons-material/Group';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import PropTypes from 'prop-types';
import axios from 'axios';
import URL from '../../config';

const getToken = () => localStorage.getItem('token');

const TabPanel = (props) => {
  const { children, value, index, ...other } = props;
  return (<div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ pt: 3 }}>{children}</Box>}</div>);
};

TabPanel.propTypes = {
  children: PropTypes.node,
  value: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired,
};

// Card for an invitee to see their specific pending invitation
const InviteePendingCard = ({ invitation, onAccept, onReject }) => (
    <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
            <Grid container alignItems="center" spacing={1}>
                <Grid item xs={12} sm={8}>
                    <Box display="flex" alignItems="center">
                        <Avatar sx={{ mr: 2 }}>{invitation.sender_name?.charAt(0)}</Avatar>
                        <Box>
                            <Typography variant="h6" component={RouterLink} to={`/collaboration/${invitation.uuid}`} sx={{textDecoration:'none', color:'primary.main', '&:hover':{textDecoration:'underline'}}}>{invitation.collab_name}</Typography>
                            <Typography variant="body2" color="textSecondary">Invited by: {invitation.sender_name}</Typography>
                        </Box>
                    </Box>
                </Grid>
                <Grid item xs={12} sm={4} sx={{ textAlign: { xs: 'left', sm: 'right' }, mt: { xs: 2, sm: 0 } }}>
                    <Button variant="contained" color="primary" size="small" startIcon={<CheckCircleIcon />} onClick={() => onAccept(invitation.uuid, invitation.receiver_id)} sx={{ mr: 1 }}>Accept</Button>
                    <Button variant="outlined" color="error" size="small" startIcon={<CancelIcon />} onClick={() => onReject(invitation.uuid, invitation.receiver_id)}>Reject</Button>
                </Grid>
            </Grid>
        </CardContent>
    </Card>
);

InviteePendingCard.propTypes = {
  invitation: PropTypes.shape({
    uuid: PropTypes.string.isRequired,
    collab_name: PropTypes.string.isRequired,
    sender_name: PropTypes.string.isRequired,
    receiver_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  }).isRequired,
  onAccept: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

// Card for the initiator's view of a multi-user collaboration
const InitiatorCollaborationCard = ({ collaboration, onWithdraw, onRevoke }) => {
    const navigate = useNavigate();
    return (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
                <Grid container alignItems="center" spacing={1}>
                    <Grid item xs={12}>
                        <Box display="flex" alignItems="center">
                            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}><GroupIcon /></Avatar>
                            <Box sx={{flexGrow: 1}}>
                                <Typography variant="h6" component={RouterLink} to={`/collaboration/${collaboration.uuid}`} sx={{textDecoration:'none', color:'primary.main', '&:hover':{textDecoration:'underline'}}}>{collaboration.collab_name}</Typography>
                                <Typography variant="body2" color="textSecondary">Initiated by You</Typography>
                            </Box>
                            <Button variant="outlined" color="primary" size="small" onClick={() => navigate(`/collaboration/${collaboration.uuid}`)}>View Details</Button>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sx={{pt: "16px !important"}}>
                        <Typography variant="subtitle2" sx={{mb:1}}>Participants:</Typography>
                        <Box>
                            {collaboration.all_invited_participants?.map(p => (
                                <Box key={p.user_id} sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 2}}>
                                    <Chip avatar={<Avatar sx={{width: 20, height: 20, fontSize: '0.75rem'}}>{p.name?.charAt(0)}</Avatar>} label={p.name} size="small" variant="outlined" />
                                    {p.status === 'pending' && <Tooltip title="Withdraw Invitation"><Button size="small" color="warning" variant="text" onClick={() => onWithdraw(collaboration.uuid, p.user_id)} startIcon={<UndoIcon/>}>Withdraw</Button></Tooltip>}
                                    {p.status === 'accepted' && <Tooltip title="Revoke Invitation"><Button size="small" color="error" variant="text" onClick={() => onRevoke(collaboration.uuid, p.user_id)} startIcon={<CancelPresentationIcon/>}>Revoke</Button></Tooltip>}
                                    {p.status !== 'pending' && p.status !== 'accepted' && <Chip label={p.status} size="small" color={p.status === 'rejected' ? 'error' : 'default'} />}
                                </Box>
                            ))}
                        </Box>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
};

InitiatorCollaborationCard.propTypes = {
  collaboration: PropTypes.shape({
    uuid: PropTypes.string.isRequired,
    collab_name: PropTypes.string.isRequired,
    all_invited_participants: PropTypes.arrayOf(PropTypes.shape({
      user_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    })),
  }).isRequired,
  onWithdraw: PropTypes.func.isRequired,
  onRevoke: PropTypes.func.isRequired,
};

const CollaborationsPage = () => {
    const [pendingInvitations, setPendingInvitations] = useState([]);
    const [activeCollaborations, setActiveCollaborations] = useState([]);
    const [sentInvitations, setSentInvitations] = useState([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const [tabValue, setTabValue] = useState(0);
    const navigate = useNavigate();

    const fetchInvitations = async () => {
        try {
            const response = await axios.get(`${URL}/api/invitations`, { headers: { Authorization: `Bearer ${getToken()}` } });
            const { current_user_id, invitations } = response.data;
            const pendingList = [], activeList = [], sentList = [];

            invitations.forEach(item => {
                if (item.view_type === 'initiator_summary') {
                    if (item.overall_status_for_initiator_tab === 'pending_responses' || item.overall_status_for_initiator_tab === 'setup') {
                        sentList.push(item);
                    } else {
                        activeList.push(item);
                    }
                } else if (item.view_type === 'invitee_specific') {
                    if (item.my_status_as_invitee === 'pending' && item.receiver_id === current_user_id) {
                        pendingList.push(item);
                    } else if (item.my_status_as_invitee === 'accepted' && item.receiver_id === current_user_id) {
                        activeList.push(item);
                    }
                }
            });
            setPendingInvitations(pendingList);
            setActiveCollaborations(activeList);
            setSentInvitations(sentList);
        } catch (err) { setSnackbar({ open: true, message: 'Failed to fetch collaborations.', severity: 'error' }); }
    };

    useEffect(() => { fetchInvitations(); }, []);

    const handleAction = async (action, collabUuid, receiverId) => {
        const endpointMap = { accept: '/api/acceptinvitation', reject: '/api/rejectinvitation', withdraw: '/api/withdrawinvitation', revoke: '/api/revoke_invitation' };
        try {
            await axios.post(`${URL}${endpointMap[action]}`, { uuid: collabUuid, receiver_id: receiverId }, { headers: { Authorization: `Bearer ${getToken()}` } });
            setSnackbar({ open: true, message: `Invitation ${action}ed!`, severity: 'success' });
            fetchInvitations();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.message || `Failed to ${action} invitation.`, severity: 'error' });
        }
    };
    
    const handleTabChange = (event, newValue) => setTabValue(newValue);
    const handleCloseSnackbar = () => setSnackbar({ ...snackbar, open: false });

    return (
        <Container component="div" maxWidth="lg" sx={{ my: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>Collaborations</Typography>
            <Paper sx={{ mb: 4, border: 1, borderColor: 'divider', boxShadow: 'none' }}>
                <Tabs value={tabValue} onChange={handleTabChange} variant="fullWidth" indicatorColor="primary" textColor="primary">
                    <Tab label={`Pending (${pendingInvitations.length})`} />
                    <Tab label={`Active (${activeCollaborations.length})`} />
                    <Tab label={`Sent (${sentInvitations.length})`} />
                </Tabs>
            </Paper>

            <TabPanel value={tabValue} index={0}>
                {pendingInvitations.length === 0 ? (<Typography>No pending invitations.</Typography>) : (
                    pendingInvitations.map((inv) => <InviteePendingCard key={inv.uuid} invitation={inv} onAccept={handleAction.bind(null, 'accept')} onReject={handleAction.bind(null, 'reject')} />)
                )}
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
                {activeCollaborations.length === 0 ? (<Typography>No active collaborations.</Typography>) : (
                    activeCollaborations.map((collab) => 
                        collab.view_type === 'initiator_summary' ? 
                        <InitiatorCollaborationCard key={collab.uuid} collaboration={collab} onWithdraw={handleAction.bind(null, 'withdraw')} onRevoke={handleAction.bind(null, 'revoke')} /> :
                        <Card key={collab.uuid} variant="outlined" sx={{ mb: 2 }}>
                            <CardContent>
                                <Grid container alignItems="center" spacing={1}>
                                    <Grid item xs={12} sm={8}>
                                        <Box display="flex" alignItems="center">
                                            <Avatar sx={{ mr: 2 }}>{collab.sender_name?.charAt(0)}</Avatar>
                                            <Box>
                                                <Typography variant="h6" component={RouterLink} to={`/collaboration/${collab.uuid}`} sx={{textDecoration:'none', color:'primary.main', '&:hover':{textDecoration:'underline'}}}>{collab.collab_name}</Typography>
                                                <Typography variant="body2" color="textSecondary">With: {collab.sender_name} (You have accepted)</Typography>
                                            </Box>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={4} sx={{textAlign: {xs: 'left', sm: 'right'}, mt: {xs: 1, sm: 0}}}>
                                        <Button size="small" variant="outlined" onClick={() => navigate(`/collaboration/${collab.uuid}`)}>View Details</Button>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>
                    )
                )}
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
                {sentInvitations.length === 0 ? (<Typography>No sent invitations awaiting responses.</Typography>) : (
                    sentInvitations.map((collab) => <InitiatorCollaborationCard key={collab.uuid} collaboration={collab} onWithdraw={handleAction.bind(null, 'withdraw')} onRevoke={handleAction.bind(null, 'revoke')} />)
                )}
            </TabPanel>
            
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity || 'info'} sx={{ width: '100%' }}>{snackbar.message}</Alert>
            </Snackbar>
        </Container>
    );
};

export default CollaborationsPage;
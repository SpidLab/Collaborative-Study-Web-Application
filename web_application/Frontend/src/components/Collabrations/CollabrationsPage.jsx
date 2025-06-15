import { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container, Typography, Button, Box, Snackbar, Paper, Alert, Card, Avatar, Tabs, Tab, Tooltip, Grid, Chip
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import GroupIcon from '@mui/icons-material/Group';
import axios from 'axios';
import URL from '../../config';
import PropTypes from 'prop-types';

const getToken = () => localStorage.getItem('token');

const TabPanel = (props) => {
  const { children, value, index } = props;
  return (
    <div 
      role="tabpanel" 
      hidden={value !== index} 
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

TabPanel.propTypes = {
  children: PropTypes.node,
  value: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired
};

// --- NEW COMPONENT to render the initiator's consolidated view ---
const InitiatorCollaborationCard = ({ collaboration, onWithdraw, onRevoke }) => {
    const navigate = useNavigate();
    return (
        <Card sx={{ mb: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6', boxShadow: 'none' }}>
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
                                {p.status === 'pending' && (
                                    <Tooltip title="Withdraw Invitation">
                                        <Button size="small" color="warning" variant="text" onClick={() => onWithdraw(collaboration.uuid, p.user_id)} startIcon={<UndoIcon/>}>Withdraw</Button>
                                    </Tooltip>
                                )}
                                {p.status === 'accepted' && (
                                     <Tooltip title="Revoke Invitation">
                                        <Button size="small" color="error" variant="text" onClick={() => onRevoke(collaboration.uuid, p.user_id)} startIcon={<CancelPresentationIcon/>}>Revoke</Button>
                                    </Tooltip>
                                )}
                                {p.status !== 'pending' && p.status !== 'accepted' && (
                                    <Chip label={p.status} size="small" />
                                )}
                            </Box>
                        ))}
                    </Box>
                </Grid>
            </Grid>
        </Card>
    );
};

InitiatorCollaborationCard.propTypes = {
    collaboration: PropTypes.shape({
        uuid: PropTypes.string.isRequired,
        collab_name: PropTypes.string.isRequired,
        all_invited_participants: PropTypes.arrayOf(PropTypes.shape({
            user_id: PropTypes.string.isRequired,
            name: PropTypes.string.isRequired,
            status: PropTypes.string.isRequired
        }))
    }).isRequired,
    onWithdraw: PropTypes.func.isRequired,
    onRevoke: PropTypes.func.isRequired
};

const CollaborationsPage = () => {
    const [pendingInvitations, setPendingInvitations] = useState([]);
    const [sentInvitations, setSentInvitations] = useState([]);
    const [acceptedCollaborations, setAcceptedCollaborations] = useState([]);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState('');
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [currentUserId, setCurrentUserId] = useState('');
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);

    const fetchInvitations = async () => {
        try {
            const response = await axios.get(`${URL}/api/invitations`, { headers: { Authorization: `Bearer ${getToken()}` } });
            const { current_user_id, invitations } = response.data;
            setCurrentUserId(current_user_id);
            
            const pending = [], sent = [], accepted = [];

            invitations.forEach(item => {
                if (item.view_type === 'initiator_summary') {
                    if (item.overall_status_for_initiator_tab === 'pending_responses') {
                        sent.push(item);
                    } else {
                        accepted.push(item);
                    }
                } else if (item.view_type === 'invitee_specific') {
                    if (item.my_status_as_invitee === 'pending' && item.receiver_id === current_user_id) {
                        pending.push(item);
                    } else if (item.my_status_as_invitee === 'accepted' && item.receiver_id === current_user_id) {
                        accepted.push(item);
                    }
                }
            });
            setPendingInvitations(pending);
            setSentInvitations(sent);
            setAcceptedCollaborations(accepted);
        } catch (error) {
            setError('Failed to fetch invitations');
        }
    };

    useEffect(() => { fetchInvitations(); }, []);

    const handleAction = async (action, collabUuid, receiverId) => {
        const endpointMap = { 
            accept: '/api/acceptinvitation', 
            reject: '/api/rejectinvitation', 
            withdraw: '/api/withdrawinvitation', 
            revoke: '/api/revoke_invitation' 
        };
        try {
            await axios.post(
                `${URL}${endpointMap[action]}`, 
                { uuid: collabUuid, receiver_id: receiverId }, 
                { headers: { Authorization: `Bearer ${getToken()}` } }
            );
            setMessage(`Invitation ${action}ed!`);
            setOpenSnackbar(true);
            fetchInvitations();
        } catch (error) {
            setMessage(error.response?.data?.message || `Failed to ${action}.`);
            setOpenSnackbar(true);
        }
    };

    const handleCloseSnackbar = () => setOpenSnackbar(false);
    const handleTabChange = (event, newValue) => setTabValue(newValue);

    if (error) return <Container sx={{mt:4}}><Alert severity="error">{error}</Alert></Container>;

    return (
        <Container component="div" maxWidth="lg" sx={{ my: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>Collaborations</Typography>
            <Paper sx={{ mb: 4, border: 1, borderColor: 'divider', boxShadow: 'none' }}>
                <Tabs value={tabValue} onChange={handleTabChange} variant="fullWidth">
                    <Tab label={`Pending (${pendingInvitations.length})`} />
                    <Tab label={`Accepted (${acceptedCollaborations.length})`} />
                    <Tab label={`Sent (${sentInvitations.length})`} />
                </Tabs>
            </Paper>

            <TabPanel value={tabValue} index={0}>
                {pendingInvitations.length === 0 ? <Typography>No pending invitations.</Typography> : 
                    pendingInvitations.map((inv) => (
                        <Card key={inv.uuid} sx={{ mb: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6', boxShadow: 'none' }}>
                            <Grid container alignItems="center">
                                <Grid item xs={12} sm={8}>
                                    <Box display="flex" alignItems="center">
                                        <Avatar sx={{mr:2}}>{inv.sender_name?.charAt(0)}</Avatar>
                                        <Box>
                                            <Typography variant="h6">{inv.collab_name}</Typography>
                                            <Typography variant="body2" color="text.secondary">Invited by: {inv.sender_name}</Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid item xs={12} sm={4} sx={{textAlign:'right'}}>
                                    <Button sx={{mr:1}} variant="contained" onClick={() => handleAction('accept', inv.uuid, inv.receiver_id)}>Accept</Button>
                                    <Button variant="outlined" color="error" onClick={() => handleAction('reject', inv.uuid, inv.receiver_id)}>Reject</Button>
                                </Grid>
                            </Grid>
                        </Card>
                    ))
                }
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
                {acceptedCollaborations.length === 0 ? <Typography>No accepted invitations.</Typography> : 
                    acceptedCollaborations.map((item) => 
                        item.view_type === 'initiator_summary' ?
                        <InitiatorCollaborationCard key={item.uuid} collaboration={item} onWithdraw={handleAction.bind(null, 'withdraw')} onRevoke={handleAction.bind(null, 'revoke')} /> :
                        <Card key={item.uuid} sx={{ mb: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6', boxShadow: 'none' }}>
                            <Grid container alignItems="center">
                                <Grid item xs={8}>
                                    <Box display="flex" alignItems="center">
                                        <Avatar sx={{mr:2}}>{item.sender_name?.charAt(0)}</Avatar>
                                        <Box>
                                            <Typography variant="h6">{item.collab_name}</Typography>
                                            <Typography variant="body2" color="text.secondary">With: {item.sender_name}</Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid item xs={4} sx={{textAlign:'right'}}>
                                    <Button variant="outlined" onClick={() => navigate(`/collaboration/${item.uuid}`)}>View Details</Button>
                                </Grid>
                            </Grid>
                        </Card>
                    )
                }
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
                {sentInvitations.length === 0 ? <Typography>No invitations sent.</Typography> : 
                    sentInvitations.map((item) => 
                        <InitiatorCollaborationCard 
                            key={item.uuid} 
                            collaboration={item} 
                            onWithdraw={handleAction.bind(null, 'withdraw')} 
                            onRevoke={handleAction.bind(null, 'revoke')} 
                        />
                    )
                }
            </TabPanel>

            <Snackbar open={openSnackbar} autoHideDuration={4000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity={message.toLowerCase().includes('failed') ? 'error' : 'success'} sx={{ width: '100%' }}>{message}</Alert>
            </Snackbar>
        </Container>
    );
};

export default CollaborationsPage;
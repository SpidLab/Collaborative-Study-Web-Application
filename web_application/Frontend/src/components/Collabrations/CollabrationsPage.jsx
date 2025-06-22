import { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Container, Typography, Button, Box, Snackbar, Paper, Alert, Card, Avatar, Tabs, Tab, Tooltip, Grid, Chip, Divider } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import axios from 'axios';
import URL from '../../config';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Cancel as CancelIcon } from '@mui/icons-material';
import Popover from '@mui/material/Popover';
import { appColors, fonts } from '../Utils/utils';

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

const CollaborationCard = ({
    collaboration,
    currentUserId,
    handleAction,
    navigate
}) => {
    const isInitiator = collaboration.initiator_id === currentUserId || collaboration.view_type === 'initiator_summary';
    const [anchorEl, setAnchorEl] = useState(null);

    const handleOpenQuickView = (event) => setAnchorEl(event.currentTarget);
    const handleCloseQuickView = () => setAnchorEl(null);
    const open = Boolean(anchorEl);

    console.log("Data of Collaborations: ",collaboration);

    return (
        <Box key={collaboration.uuid}>
            <Card sx={{ mb: 2, p: 2, borderRadius: 3, border: 1, borderColor: appColors.borderV2, boxShadow: 'none' }}>
                <Grid container alignItems="center">
                    <Grid item xs={12} sm={8}>
                        <Box display="flex" alignItems="center">
                            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                                 <GroupIcon />
                            </Avatar>
                            <Box>
                                <Typography variant="h6" component={RouterLink} to={`/collaboration/${collaboration.uuid}`} sx={{ color: appColors.title, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                                    {collaboration.collab_name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {isInitiator ? "Initiated by You" : `Initiated by ${collaboration.sender_name}`}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4} sx={{ textAlign: 'right' }}>
                        <>
                            <Button
                                variant="contained"
                                color="primary"
                                size="small"
                                onClick={handleOpenQuickView}
                                sx={{ borderRadius: 10, boxShadow: 0, fontSize: fonts.actionButton, mr: 1}}
                            >
                                QUICK VIEW
                            </Button>
                            <Button
                                variant="outlined"
                                color="primary"
                                size="small"
                                onClick={() => navigate(`/collaboration/${collaboration.uuid}`)}
                                sx={{borderRadius: 10, fontSize: fonts.actionButton }}
                            >
                                View Details
                            </Button>
                        </>
                    </Grid>
                </Grid>
            </Card>
            {/* Initiator's Quick View Popover */}
            
                <Popover
                    open={open}
                    anchorEl={anchorEl}
                    onClose={handleCloseQuickView}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    PaperProps={{
                        sx: {
                            borderRadius: 2,
                            p: 1.5,
                            minWidth: 260,
                            maxWidth: 320,
                            boxShadow: 'none',
                            position: 'relative',
                            mt: 1,
                            border: 1,
                            borderColor: appColors.borderV1
                        }
                    }}
                >
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500 }}>
                        Participants
                    </Typography>
                    {(collaboration.all_participants || []).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No participants.</Typography>
                    ) : (
                        (collaboration.all_participants || []).map(p => (
                            <Box
                                key={p.user_id}
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    mb: 1,
                                    p: 0.5,
                                    borderRadius: 10,
                                    border: 1,
                                    borderColor: appColors.borderV2
                                }}
                            >
                                <Chip
                                    avatar={<Avatar sx={{ width: 20, height: 20, fontSize: '0.75rem' }}>{p.name?.charAt(0)}</Avatar>}
                                    label={p.name}
                                    size="small"
                                    sx={{ fontSize: '0.85rem', bgcolor: 'background.paper', mr: 1 }}
                                />
                                {isInitiator ? (
                                    <>
                                        {p.status === 'pending' && (
                                            <Tooltip title="Withdraw Invitation">
                                                <Button
                                                    size="small"
                                                    color="warning"
                                                    variant="outlined"
                                                    onClick={() => handleAction('withdraw', collaboration.uuid, p.user_id)}
                                                    sx={{ minWidth: 0, px: 1, fontSize: fonts.actionButton, borderRadius: 10 }}
                                                >
                                                    Withdraw
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {p.status === 'accepted' && (
                                            <Tooltip title="Revoke Invitation">
                                                <Button
                                                    size="small"
                                                    color="error"
                                                    variant="outlined"
                                                    onClick={() => handleAction('revoke', collaboration.uuid, p.user_id)}
                                                    sx={{ minWidth: 0, px: 1, fontSize: fonts.actionButton, borderRadius: 10 }}
                                                >
                                                    Revoke
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {(p.status !== 'pending' && p.status !== 'accepted') && (
                                            <Chip label={p.status.charAt(0).toUpperCase() + p.status.slice(1).toLowerCase()} size="small" sx={{ fontSize: fonts.chipsText, bgcolor: appColors.errorBg, color: appColors.errorTx }} />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {p.status === 'pending' && p.user_id === currentUserId ? (
                                            <>
                                                <Button
                                                    sx={{ mr: 1, borderRadius: 10, boxShadow: "none", fontSize: fonts.actionButton }}
                                                    variant="contained"
                                                    startIcon={<CheckCircleIcon />}
                                                    size="small"
                                                    onClick={() => handleAction('accept', collaboration.uuid, p.user_id)}
                                                >
                                                    Accept
                                                </Button>
                                                <Button
                                                    sx={{ borderRadius: 10, color: "secondary", fontSize: fonts.actionButton }}
                                                    variant="outlined"
                                                    startIcon={<CancelIcon />}
                                                    size="small"
                                                    onClick={() => handleAction('reject', collaboration.uuid, p.user_id)}
                                                >
                                                    Reject
                                                </Button>
                                            </>
                                        ) : (
                                            <Chip
                                                label={p.status.charAt(0).toUpperCase() + p.status.slice(1).toLowerCase()}
                                                size="small"
                                                sx={{
                                                    fontSize: fonts.chipsText,
                                                    color: p.status === 'pending'
                                                        ? appColors.pendingTx
                                                        : p.status === 'accepted'
                                                        ? appColors.acceptedTx
                                                        : p.status === 'rejected'
                                                        ? appColors.rejectedTx
                                                        : appColors.errorTx,
                                                    bgcolor:
                                                        p.status === 'pending'
                                                            ? appColors.pendingBg
                                                            : p.status === 'accepted'
                                                            ? appColors.acceptedBg
                                                            : p.status === 'rejected'
                                                            ? appColors.rejectedBg
                                                            : appColors.errorBg 
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                            </Box>
                        ))
                    )}
                    <Divider sx={{ flexGrow: 30, borderColor: appColors.borderV1, my: 0.5  }} />
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500 }}>
                        Experiments 
                    </Typography>
                    {(collaboration.experiments || []).flat().length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No experiments.</Typography>
                    ) : (
                        (collaboration.experiments || []).flat().map((exp, idx) => (
                            <Chip
                                key={exp || idx}
                                label={typeof exp === 'string' ? exp : (exp.name || '')}
                                size="small"
                                sx={{ mr: 1, mb: 1, fontSize: fonts.chipsText, bgcolor: appColors.chipBg, color: appColors.chipTx }}
                            />
                        ))
                    )}
                   <Divider sx={{ flexGrow: 30, borderColor: appColors.borderV1, my: 0.5 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500 }}>
                        QC Schemes 
                    </Typography>
                    {(collaboration.collabQcScheme || []).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No QcShemes.</Typography>
                    ) : (
                        (collaboration.collabQcScheme || []).map((scheme, idx) => (
                            <Chip
                                key={scheme || idx}
                                label={typeof scheme === 'string' ? scheme : (scheme.name || '')}
                                size="small"
                                sx={{ mr: 1, mb: 1, fontSize: fonts.chipsText, bgcolor: appColors.chipBg, color: appColors.chipTx }}
                            />
                        ))
                    )}
                </Popover>
        </Box>
    );
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
            console.log("Invitation Data: ", invitations);

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

    if (error) return <Container sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>;

    return (
        <Container component="div" maxWidth="lg" sx={{ my: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>Collaborations</Typography>
            <Paper sx={{ mb: 2, border: 1, borderRadius: 10, borderColor: 'divider', boxShadow: 'none' }}>
                <Tabs value={tabValue} onChange={handleTabChange} variant="fullWidth" sx={{ borderRadius: 10 }}>
                    <Tab label={`Pending (${pendingInvitations.length})`} />
                    <Tab label={`Accepted (${acceptedCollaborations.length})`} />
                    <Tab label={`Sent (${sentInvitations.length})`} />
                </Tabs>
            </Paper>
            <TabPanel value={tabValue} index={0}>
                {pendingInvitations.length === 0 ? <Typography>No pending invitations.</Typography> :
                    pendingInvitations.map((inv) => (
                        <CollaborationCard
                            key={inv.uuid}
                            collaboration={inv}
                            currentUserId={currentUserId}
                            handleAction={handleAction}
                            navigate={navigate}
                        />
                    ))
                }
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
                {acceptedCollaborations.length === 0 ? <Typography>No accepted invitations.</Typography> :
                    acceptedCollaborations.map((item) => (
                        <CollaborationCard
                            key={item.uuid}
                            collaboration={item}
                            currentUserId={currentUserId}
                            handleAction={handleAction}
                            navigate={navigate}
                        />
                    ))
                }
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
                {sentInvitations.length === 0 ? <Typography>No invitations sent.</Typography> :
                    sentInvitations.map((item) => (
                        <CollaborationCard
                            key={item.uuid}
                            collaboration={item}
                            currentUserId={currentUserId}
                            handleAction={handleAction}
                            navigate={navigate}
                        />
                    ))
                }
            </TabPanel>
            <Snackbar open={openSnackbar} autoHideDuration={4000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity={message.toLowerCase().includes('failed') ? 'error' : 'success'} sx={{ width: '100%' }}>{message}</Alert>
            </Snackbar>
        </Container>
    );
};

export default CollaborationsPage;
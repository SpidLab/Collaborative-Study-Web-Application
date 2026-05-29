import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, alpha, Divider, Button, Slider, TextField, Chip, Grid, Checkbox, Snackbar, Alert, CircularProgress, Container, Card, CardContent, List, ListItem, ListItemText, Tabs, Tab, Tooltip, TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Stepper, Step, StepContent, StepLabel, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { Add, Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon, DownloadRounded, RadioButtonUncheckedRounded, Summarize as SummarizeIcon, Refresh as RefreshIcon, ShieldOutlined as ShieldIcon } from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import axios from 'axios';
import URL from '../../config';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import statSampleImage from "../../assets/Stat Sample.png";
import InfoIcon from '@mui/icons-material/Info';
import FLCollaborationView from './FLCollaborationView';

const EXPERIMENT_FL = 'Federated Learning';

// QC Methods that skip threshold and show SNP list instead
const SNP_FILTER_QC_METHODS = ['Minor Allele Frequency', 'MAF', 'Hardy-Weinberg Equilibrium', 'HWE', 'Missing Data QC', 'Missing'];


const CollaborationDetails = () => {
  const { uuid } = useParams();
  const [collaboration, setCollaboration] = useState(null);
  const [collabName, setCollabName] = useState('');
  const [experimentName, setExperimentName] = useState('');
  const [experimentList, setExperimentList] = useState([]);
  const [qcScheme, setQcScheme] = useState([]);
  const [phenoType, setPhenotype] = useState('');
  const [creator, setCreator] = useState('');
  // const [samples, setSamples] = useState('');
  const [file, setFile] = useState(null);
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [senderInfo, setSenderInfo] = useState({ id: null, name: '' });
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [collaborationUuid, setCollaborationUuid] = useState('');
  const [threshold, setThreshold] = useState(null);
  const [thresholdDefined, setThresholdDefined] = useState();
  const [newThreshold, setNewThreshold] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progressActiveStep, setProgressActiveStep] = useState(0);
  const [isQcInitiateLoading, setIsQcInitiateLoading] = useState(false);
  const [qcResultsAvailable, setQcResultsAvailable] = useState(false);
  const [qcResults, setQcResults] = useState(null);
  const [isQcResultsLoading, setIsQcResultsLoading] = useState(false);
  const [displayQcResults, setdisplayQcResults] = useState(false);
  const [qcInitiated, setQcInitiated] = useState(false); // New state to track QC initiation
  const [filteredResults, setFilteredResults] = useState([]);
  const [gwasResults, setGwasResults] = useState([]);
  const [gwasResultsAvailable, setGwasResultsAvailable] = useState(false);
  const [isGwasInitiateLoading, setIsGwasInitiateLoading] = useState(false);
  const [isCreatingGwasDataset, setIsCreatingGwasDataset] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevFilteredResultsRef = useRef();
  // const [matrix, setMatrix] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [originalCollabName, setOriginalCollabName] = useState('');
  const [originalExperimentList, setOriginalExperimentList] = useState([]);
  const [originalPhenoType, setOriginalPhenoType] = useState('');
  const [originalSamples, setOriginalSamples] = useState('');
  const [selectedTab, setSelectedTab] = useState(0); // for GWAS results

  const [isCreatingQcDataset, setIsCreatingQcDataset] = useState(false);

  // One-page summary (privacy-preserving) of GWAS chi-square results
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState(null);
  
  // Check if current QC scheme uses SNP filtering (skip threshold)
  const qcMethodNames = qcScheme.map(s => s.method || s);
  const hasPairwiseQc = qcMethodNames.some(m => 
    m.includes('Sample Relatedness') || m.includes('Population Stratification')
  );
  const hasFilterQc = qcMethodNames.some(m =>
    SNP_FILTER_QC_METHODS.some(method => m.toLowerCase().includes(method.toLowerCase()))
  );
  const isFilterOnlyQc = hasFilterQc && !hasPairwiseQc;

  const determineUserRole = (data) => {
    if (data.is_sender) {
      setRole('sender');
    } else {
      setRole('receiver');
    }
  };
  const steps = ['QC Calculation', 'Stat Data Upload'];


  useEffect(() => {
    const fetchCollaborationDetails = async () => {
      // Reset all QC and GWAS related state when UUID changes (new collaboration loaded)
      setQcResultsAvailable(false);
      setQcResults(null);
      setGwasResultsAvailable(false);
      setGwasResults([]);
      setThreshold(null);
      setThresholdDefined(false);
      setNewThreshold(null);
      setdisplayQcResults(false);
      setActiveStep(0);
      setIsQcInitiateLoading(false);
      
      try {
        const response = await axios.get(`${URL}/api/collaboration/${uuid}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        console.log("Data from Backend: ", response.data);
        setCollaboration(response.data);
        setCollabName(response.data.name);
        setExperimentList(response.data.experiments || []);
        const rawQcScheme = response.data.collabQcScheme || [];
        const normalizedQc = rawQcScheme.map(item =>
          typeof item === 'string' ? { method: item, params: {} } : item
        );
        setQcScheme(normalizedQc);
        console.log("QC Scheme: ", normalizedQc);
        setPhenotype(response.data.creator_datasets.phenotype || []);
        setCreator(response.data.creator_datasets || []);
        setCollaborationUuid(response.data.uuid);
        setSenderInfo({ is_sender: response.data.is_sender, name: response.data.sender_name, id: response.data.sender_id });
        setInvitedUsers(response.data.invited_users || []);
        determineUserRole(response.data);
        
        // After fetching collaboration details, check QC status
        if (response.data.collabQcScheme && response.data.collabQcScheme.length > 0) {
          await checkQcStatus(response.data.collabQcScheme);
        }
        
        // Also check GWAS status when component mounts
        await checkGwasStatus();
      } catch (error) {
        console.error('Error fetching collaboration details:', error);
        setSnackbar({
          open: true,
          message: 'Failed to fetch collaboration details. Please try again.',
          severity: 'error',
        });
      }
    };
    fetchCollaborationDetails();
  }, [uuid]);


  // setting the current user id
  const current_user_id = collaboration?.current_logged_in_user_id;


  const handleAddExperiment = () => {
    if (experimentName.trim()) {
      setExperimentList([...experimentList, experimentName.trim()]);
      setExperimentName('');
    } else {
      setSnackbar({ open: true, message: 'Experiment name cannot be empty.', severity: 'error' });
    }
  };

  const handleDeleteExperiment = (index) => {
    const updatedList = experimentList.filter((_, i) => i !== index);
    setExperimentList(updatedList);
  };
  // Stat upload handlers
  const handleFileUpload = (e) => {
    setFile(e.target.files[0]);
  };

  const handleChainedQcCreate = async () => {
    if (!uuid) {
      setSnackbar({ open: true, message: 'Collaboration not found.', severity: 'error' });
      return;
    }
    setIsCreatingQcDataset(true);
    try {
      const response = await axios.post(
        `${URL}/api/qc/create_chained`,
        { uuid },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.status === 200) {
        setSnackbar({ open: true, message: 'QC dataset created successfully. Data filtered and ready.', severity: 'success' });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to create QC dataset';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsCreatingQcDataset(false);
    }
  };

  const handleCreateGwasDataset = async () => {
    // For filter-only QC, use surviving_samples from collaboration; for pairwise, use filteredResults
    let sampleIds;
    if (isFilterOnlyQc && collaboration?.surviving_samples?.[current_user_id]) {
      sampleIds = collaboration.surviving_samples[current_user_id];
    } else {
      sampleIds = filteredResults?.userSamplesList?.[current_user_id];
    }
    if (!sampleIds || !Array.isArray(sampleIds) || sampleIds.length === 0) {
      setSnackbar({ open: true, message: 'No QC-filtered samples available.', severity: 'error' });
      return;
    }
    if (!uuid) {
      setSnackbar({ open: true, message: 'Collaboration not found.', severity: 'error' });
      return;
    }
    setIsCreatingGwasDataset(true);
    try {
      const response = await axios.post(
        `${URL}/api/create_gwas_dataset`,
        { uuid, sample_ids: sampleIds },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.status === 200) {
        setSnackbar({ open: true, message: 'GWAS dataset created successfully.', severity: 'success' });
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to create GWAS dataset';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsCreatingGwasDataset(false);
    }
  };

  const handleSubmitStat = async () => {
    if (!file) {
      setSnackbar({ open: true, message: "No File Selected.", severity: 'error' });
      return;
    }

    const collabStatData = new FormData();
    collabStatData.append('file', file);
    collabStatData.append('uuid', uuid);

    try {
      //waiting for the endpoint to be created
      const response = await axios.post(`${URL}/api/upload_csv_stats`, collabStatData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.status === 200) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }

      setSnackbar({
        open: true,
        message: 'Stat data uploaded Successfully!',
        severity: 'success'
      });

      setFile('');

    } catch (error) {
      console.error('Error uploading file:', error);
      setSnackbar({
        open: true,
        message: 'Failed to upload Stat data, please try again.',
        severity: 'error'
      });
    }
  };
  // Helper function to get the current user's dataset ID
  const getCurrentUserDatasetId = () => {
    if (!collaboration || !current_user_id || !collaboration.invited_users) {
      return null;
    }

    // Check if current user is the creator
    if (collaboration.sender_id === current_user_id) {
      return collaboration.creator_dataset_id;
    }

    // Check if current user is an invited user
    const invitedUser = collaboration.invited_users.find(user => user.user_id === current_user_id);
    if (invitedUser) {
      return invitedUser.user_dataset_id;
    }

    return null;
  };

  // Helper function to get the current user's information
  const getCurrentUserInfo = () => {
    if (!collaboration || !current_user_id || !collaboration.invited_users) {
      return null;
    }

    // Check if current user is the creator
    if (collaboration.sender_id === current_user_id) {
      return {
        name: collaboration.sender_name,
        phenotype: collaboration.creator_datasets?.phenotype,
        number_of_samples: collaboration.creator_datasets?.samples,
        isCreator: true
      };
    }

    // Check if current user is an invited user
    const invitedUser = collaboration.invited_users.find(user => user.user_id === current_user_id);
    if (invitedUser) {
      return {
        name: invitedUser.name,
        phenotype: invitedUser.phenotype,
        number_of_samples: invitedUser.number_of_samples,
        isCreator: false
      };
    }

    return null;
  };

  

  //Updates DB with the user's dataset file
  const handleQcUpload = async () => {
    if (!file) {
      setSnackbar({ open: true, message: "No File Selected.", severity: 'error' });
      return;
    }

    // Get the current user's dataset ID dynamically
    const currentUserDatasetId = getCurrentUserDatasetId();
    if (!currentUserDatasetId) {
      setSnackbar({ 
        open: true, 
        message: "Could not determine your dataset. Please refresh the page and try again.", 
        severity: 'error' 
      });
      return;
    }

    const qcData = new FormData();
    qcData.append('file', file);
    qcData.append('dataset_id', currentUserDatasetId);

    try {
      //waiting for the endpoint to be created
      const response = await axios.post(`${URL}/api/update_qc_data`, qcData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      setTimeout(() => {
        window.location.reload(); // reloads the page after 2 seconds
      }, 1000);

      checkQcStatus();

      // console.log('File uploaded successfully:', response.data);
      setSnackbar({
        open: true,
        message: 'QC Data uploaded Successfully!',
        severity: 'success'
      });

      setFile('');

    } catch (error) {
      console.error('Error uploading file:', error);
      setSnackbar({
        open: true,
        message: 'Failed to upload QC Data, please try again.',
        severity: 'error'
      });
    }
  };


  // const handleUpdateCollaboration = async () => {
  //   setIsLoading(true);
  //   try {
  //     const updateData = {
  //       name: collabName,
  //       experiments: experimentList,
  //       phenotype: phenoType,
  //       samples: samples,
  //     };
  //     if (role === 'receiver') {
  //       updateData.stat_data = file ? file.name : null;
  //     }
  //     await axios.put(`${URL}/api/collaboration/${uuid}`, updateData, {
  //       headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  //     });
  //     setSnackbar({
  //       open: true,
  //       message: 'Collaboration updated successfully!',
  //       severity: 'success',
  //     });
  //     setIsEditing(false);
  //   } catch (error) {
  //     console.error('Error updating collaboration:', error);
  //     setSnackbar({
  //       open: true,
  //       message: 'Failed to update collaboration. Please try again.',
  //       severity: 'error',
  //     });
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const handleAccept = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/acceptinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) =>
          prevUsers.map((user) =>
            user.user_id === userId ? { ...user, status: 'accepted' } : user
          )
        );
        setSnackbar({ open: true, message: 'Invitation accepted successfully!', severity: 'success' });
        setTimeout(() => {
          window.location.reload();
        }, 100);

      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setSnackbar({ open: true, message: 'Failed to accept invitation. Please try again.', severity: 'error' });
    }
  };

  const handleReject = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/rejectinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) => prevUsers.filter((user) => user.user_id !== userId));
        setSnackbar({ open: true, message: 'Invitation rejected successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error rejecting invitation:', error);
      setSnackbar({ open: true, message: 'Failed to reject invitation. Please try again.', severity: 'error' });
    }
  };

  const handleWithdraw = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/withdrawinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) => prevUsers.filter((user) => user.user_id !== userId));
        setSnackbar({ open: true, message: 'Invitation withdrawn successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error withdrawing invitation:', error);
      setSnackbar({ open: true, message: 'Failed to withdraw invitation. Please try again.', severity: 'error' });
    }
  };


  // Send the threshold value to the backend
  const handleSubmitThreshold = async () => {
    try {
      const response = await axios.post(`${URL}/api/datasets/${uuid}/qc-results`, {
        threshold: newThreshold,
        qc_scheme: qcMethodNames.find(m => m.includes('Sample Relatedness') || m.includes('Population Stratification')) || qcMethodNames[0]
      },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      if (response.status === 200) {
        setThresholdDefined(true);
        setThreshold(newThreshold);
        setTimeout(() => {
          window.location.reload(); // reloads the page after 2 seconds
        }, 1000);
        setSnackbar({
          open: true,
          message: 'Threshold applied successfully.',
          severity: 'success',
        });
      }
    } catch (error) {
      console.error('Error submitting threshold:', error);

      setSnackbar({
        open: true,
        message: 'Failed to apply threshold. Please try again.',
        severity: 'error',
      });
    }
  };


  const checkQcStatus = async (schemeToCheck = null) => {
    // Use provided scheme or fall back to state
    const scheme = schemeToCheck || qcScheme;
    
    // Check if qcScheme is available
    if (!scheme || scheme.length === 0) {
      console.log("No QC scheme available");
      setQcResultsAvailable(false);
      return false;
    }

    // Find the pairwise method in the scheme (Sample Relatedness or Population Stratification)
    const methods = scheme.map(s => s.method || s);
    const pairwiseMethod = methods.find(m => m.includes('Sample Relatedness') || m.includes('Population Stratification'));
    if (!pairwiseMethod) {
      console.log("Filter-only QC - no pairwise results to check");
      setQcResultsAvailable(false);
      return false;
    }
    
    try {
      const response = await axios.get(`${URL}/api/datasets/${uuid}/qc-results?qc_scheme=${pairwiseMethod}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      console.log("QC results", response);
      if (response.status === 200) {
        setQcResultsAvailable(true);
        setdisplayQcResults(true);
        setIsQcInitiateLoading(false);
        setQcResults(response.data.full_qc_results ?? response.data.population_stratification); // Store QC results
        // below condition ensures if the threshold already defined by user earlier, it shall be used when user interacts with the UI again.
        if (response.data.threshold !== null) {
          setThreshold(response.data.threshold);
          setNewThreshold(response.data.threshold);
          setThresholdDefined(true);
          console.log("is threshold value define", threshold);
        } else {
          setThresholdDefined(false)
        }

        return true;
      } else {
        setQcResultsAvailable(false);
        return false;
      }
    } catch (error) {
      console.error('Error checking QC status:', error);
      setQcResultsAvailable(false); // Default to unavailable in case of error
      return false;
    }
  };
  // }
  console.log("QC Loading", isQcInitiateLoading);

  const checkGwasStatus = async () => {
    try {
      // check the endpoints for GWAS Results
      const response = await axios.get(`${URL}/api/calculate_chi_square_results/${uuid}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      console.log('GWAS Results:', response.data.chi_square_results);
      const results = response.data?.chi_square_results ?? {};
      const hasResults = response.status === 200 &&
        response.data?.status === 'complete' &&
        typeof results === 'object' &&
        Object.keys(results).length > 0;
      if (hasResults) {
        setGwasResults(results);
        setGwasResultsAvailable(true);
        return true; // Results are available
      } else {
        setGwasResultsAvailable(false);
        setGwasResults({});
        return false; // Results are not available
      }
    } catch (error) {
      console.log('GWAS results not yet available:', error.message);
      setGwasResultsAvailable(false); // Default to unavailable in case of error
      return false; // Results are not available
    }
  };


  const handleGwasInitiate = async () => {
    try {
      setIsGwasInitiateLoading(true);
      
      const resultsAvailable = await checkGwasStatus();

      if (resultsAvailable) {
        setSnackbar({
          open: true,
          message: 'GWAS calculations are already completed.',
          severity: 'info',
        });
        setIsGwasInitiateLoading(false);
        return; // Exit early if results are available
      }

      // Proceed with GWAS initiation if no results are available
      const response = await axios.post(
        `${URL}/api/calculate_chi_square`,
        { uuid: uuid },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          }
        }
      );
      console.log('GWAS Results:', response);
      setSnackbar({
        open: true,
        message: 'GWAS Calculations successfully initiated. Results will be checked automatically.',
        severity: 'success',
      });
      
      // Check GWAS status after a delay to see if results are ready
      setTimeout(async () => {
        await checkGwasStatus();
      }, 5000);
      
      // Set up periodic checking for GWAS results
      const checkInterval = setInterval(async () => {
        const resultsAvailable = await checkGwasStatus();
        if (resultsAvailable) {
          clearInterval(checkInterval);
          // Results are now available - the UI will automatically update
          // and show the "Get GWAS Results" button
        }
      }, 10000); // Check every 10 seconds
      
      // Clear interval after 5 minutes to avoid infinite checking
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 300000);
      
    } catch (error) {
      console.error('Error initiating GWAS calculations:', error);
      setSnackbar({
        open: true,
        message: 'Failed to initiate GWAS calculations. Please try again.',
        severity: 'error',
      });
    } finally {
      setIsGwasInitiateLoading(false);
    }
  };

  const handleGwasResults = async () => {
    const hasResults = gwasResultsAvailable && gwasResults && Object.keys(gwasResults).length > 0;
    if (hasResults) {
      setSnackbar({ open: true, message: 'Results are already available.', severity: 'info' });
      return;
    }

    try {
      const response = await axios.get(`${URL}/api/calculate_chi_square_results/${uuid}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const results = response.data?.chi_square_results ?? {};
      const hasNewResults = response.status === 200 &&
        response.data?.status === 'complete' &&
        typeof results === 'object' &&
        Object.keys(results).length > 0;

      if (hasNewResults) {
        setSnackbar({ open: true, message: 'Results are available.', severity: 'success' });
        setGwasResults(results);
        setGwasResultsAvailable(true);
      } else {
        setSnackbar({ open: true, message: 'Results are not available.', severity: 'info' });
        setGwasResultsAvailable(false);
        setGwasResults({});
      }
    } catch (error) {
      console.error('Error fetching Gwas results:', error);
      setSnackbar({ open: true, message: 'Error fetching results.', severity: 'error' });
    }
  };

  // Fetch any cached one-page summary for this collaboration (initiator only).
  const fetchAiSummary = async () => {
    if (role !== 'sender') return;
    try {
      const response = await axios.get(`${URL}/api/collaboration/${uuid}/gwas-summary`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const summary = response?.data?.ai_summary ?? null;
      setAiSummary(summary);
      setAiSummaryError(null);
    } catch (error) {
      if (error?.response?.status === 403) {
        return;
      }
      console.log('No cached summary yet:', error.message);
      setAiSummary(null);
    }
  };

  const handleGenerateAiSummary = async () => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const response = await axios.post(
        `${URL}/api/collaboration/${uuid}/gwas-summary`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      const summary = response?.data?.ai_summary ?? null;
      setAiSummary(summary);
      setSnackbar({ open: true, message: 'Result summary generated.', severity: 'success' });
    } catch (error) {
      const msg = error?.response?.data?.error || error.message || 'Failed to generate summary';
      console.error('AI summary generation error:', msg);
      setAiSummaryError(msg);
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setAiSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'sender' && gwasResultsAvailable && uuid) {
      fetchAiSummary();
    } else {
      setAiSummary(null);
      setAiSummaryError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, gwasResultsAvailable, uuid]);

  const handleQcInitiate = async () => {
    setIsQcInitiateLoading(true);
    try {
      const resultsAvailable = await checkQcStatus();
      console.log("qcScheme main: ", qcScheme);
      if (resultsAvailable) {
        setSnackbar({
          open: true,
          message: 'QC calculations are already completed.',
          severity: 'info',
        });
        return; // Exit early if results are available
      }

      // Proceed with QC initiation if no results are available
      const response = await axios.post(
        `${URL}/api/datasets/${uuid}`,
        {qc_scheme: qcScheme.map(s => s.method || s)},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      
      if (response.status === 200) {
        setSnackbar({
          open: true,
          message: 'QC Calculations successfully Initiated. Please wait a moment and check for results.',
          severity: 'success',
        });
        // Auto refresh after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error('Error initiating QC calculations:', error);
      setSnackbar({
        open: true,
        message: 'Failed to initiate QC calculations. Please try again.',
        severity: 'error',
      });
      setIsQcInitiateLoading(false);
    }
  };
  // handleQcResults function might not be necessary since we are already checking the results in checkQcStatus function --- verify later
  const handleQcResults = async () => {
    if (qcResults) {
      setSnackbar({ open: true, message: 'Results are already available.', severity: 'info' });
      return;
    }

    setIsQcResultsLoading(true);
    try {
      const pairwiseMethodName = qcMethodNames.find(m => m.includes('Sample Relatedness') || m.includes('Population Stratification')) || qcMethodNames[0];
      const response = await axios.get(`${URL}/api/datasets/${uuid}/qc-results?qc_scheme=${pairwiseMethodName}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      console.log(response.data);

      if (response.status === 200) {
        setSnackbar({ open: true, message: 'Results are available.', severity: 'success' });
        setQcResultsAvailable(true);
        setQcResults(response.data.full_qc_results ?? response.data.population_stratification); // Store QC results
        // below condition ensures if the threshold already defined by user earlier, it shall be used when user interacts with the UI again.
        if (response.data.threshold !== null) {
          setThreshold(response.data.threshold);
          setThresholdDefined(true);
        } else {
          setThresholdDefined(false)
        }
      } else {
        setSnackbar({ open: true, message: 'Results are not available.', severity: 'info' });
      }
    } catch (error) {
      console.error('Error fetching QC results:', error);
      setSnackbar({ open: true, message: 'Error fetching results.', severity: 'error' });
    } finally {
      setIsQcResultsLoading(false);
      setdisplayQcResults(true);
    }
  };
  // console.log("QC Results", qcResults);
  // const getMatrix = () => {
  //   if (!qcResults) return [];
  //   return qcResults.map((item) => [
  //     item.phi_value,
  //     item.sample1,
  //     item.sample2
  //   ]);
  // };
  // const matrix = getMatrix();

  // const handleSliderChange = (event, newValue) => {
  //   setThresholdDefined(false);
  //   setThreshold(newValue);
  // };

  // console.log("matrix",matrix);

  // const filterData = (threshold) => {
  //   const filteredData = matrix.filter(row => row.phi_value >= threshold);
  //   setFilteredResults(filteredData);
  // };

  // // Re-filter the data when threshold changes
  // useEffect(() => {
  //   const filteredResults = matrix.filter(row => row[0] < threshold);
  //   console.log('Filtered Results:', filteredResults);
  //   // Only set state if filtered results have changed (compare with previous state)
  //   if (JSON.stringify(filteredResults) !== JSON.stringify(prevFilteredResultsRef.current)) {
  //     setFilteredResults(filteredResults);
  //     prevFilteredResultsRef.current = filteredResults; // Update the ref with the current filtered results
  //   }
  // }, [threshold, matrix]);

  // const getGroupedSampleCounts = (qcResults, threshold) => {
  //   if (!qcResults || !Array.isArray(qcResults)) return { userCounts: {}, totalSamples: 0, filteredData: [] }; // Safety check

  //   const userSamples = {}; // Object to track unique samples per user

  //   // Filter data first based on threshold
  //   const filteredData = qcResults.filter(({ phi_value }) => phi_value < threshold);

  //   filteredData.forEach(({ sample1, sample2, user1, user2 }) => {
  //     if (!userSamples[user1]) userSamples[user1] = new Set();
  //     if (!userSamples[user2]) userSamples[user2] = new Set();

  //     userSamples[user1].add(sample1);
  //     userSamples[user2].add(sample2);
  //   });

  //   const userSamplesList = {};
  //   Object.keys(userSamples).forEach(user => {
  //       userSamplesList[user] = Array.from(userSamples[user]);
  //   });

  //   console.log("Unique Samples per User:", userSamplesList);

  //   // Calculate total samples per user and overall count
  //   let totalSamples = 0;
  //   const userCounts = {};
  //   Object.keys(userSamples).forEach(user => {
  //     userCounts[user] = userSamples[user].size;
  //     totalSamples += userSamples[user].size;
  //   });

  //   return { userCounts, totalSamples, filteredData };
  // };

  // const handleSliderChange = (event, newValue) => {
  //   setThreshold(newValue);
  //   if (!qcResults || !Array.isArray(qcResults)) return;
  //   const { userCounts, totalSamples, filteredData } = getGroupedSampleCounts(qcResults, newValue);
  //   setFilteredResults({ userCounts, filteredData });
  //   setThresholdDefined(false);
  // };

  // useEffect(() => {
  //   if (!qcResults || !Array.isArray(qcResults) || qcResults.length === 0) return;
  //   const { userCounts, totalSamples, filteredData } = getGroupedSampleCounts(qcResults, threshold);
  //   console.log("Updated User-wise sample count:", userCounts);
  //   console.log("Updated Total unique samples:", totalSamples);
  //   setFilteredResults({ userCounts, filteredData });
  // }, [threshold, qcResults]);

  // console.log('Creators Datasets Number of Samples', collaboration.creator_datasets.samples);
  // console.log('Collabortator Datasets Number of Samples', invitedUsers[0].number_of_samples);
  const getUserName = (userId) => {
    if (senderInfo.id === userId) return senderInfo.name; // Check if sender matches
    const invitedUser = invitedUsers?.find(user => user.user_id === userId);
    return invitedUser ? invitedUser.name : "Unknown User"; // Return name if found
  };
  // Function below will only work for single collaborator and initiator (might need change for multi user)
  // const getCurrentUserId = (role) => {
  //   return role === 'sender'
  //     ? senderInfo.id
  //     : invitedUsers?.[0]?.user_id || null;
  // };
  // const currentUserId = getCurrentUserId(role);
  // console.log(currentUserId);



  // const getGroupedSampleCounts = (qcResults, threshold) => {
  //   if (!qcResults || !Array.isArray(qcResults)) return {
  //     userCounts: {},
  //     totalSamples: 0,
  //     selectedSamples: 0,
  //     filteredData: [],
  //     userSamplesList: {}
  //   };

  //   const userSamples = {};
  //   const allUniqueSamples = new Set();
  //   const selectedUniqueSamples = new Set();

  //   const filteredData = qcResults.filter(({ phi_value }) => phi_value < threshold);

  //   qcResults.forEach(({ sample1, sample2 }) => {
  //     allUniqueSamples.add(sample1);
  //     allUniqueSamples.add(sample2);
  //   });

  //   filteredData.forEach(({ sample1, sample2, user1, user2 }) => {
  //     if (!userSamples[user1]) userSamples[user1] = new Set();
  //     if (!userSamples[user2]) userSamples[user2] = new Set();

  //     userSamples[user1].add(sample1);
  //     userSamples[user2].add(sample2);

  //     selectedUniqueSamples.add(sample1);
  //     selectedUniqueSamples.add(sample2);
  //   });
  //   const userSamplesList = {};
  //   Object.keys(userSamples).forEach(user => {
  //     userSamplesList[user] = Array.from(userSamples[user]);
  //   });

  //   // Calculate sample counts
  //   return {
  //     userCounts: Object.fromEntries(Object.entries(userSamples).map(([user, samples]) => [user, samples.size])),
  //     totalSamples: allUniqueSamples.size,
  //     selectedSamples: selectedUniqueSamples.size,
  //     filteredData,
  //     userSamplesList
  //   };
  // };


  const getGroupedSampleCounts = (qcResults, newThreshold) => {
    if (!qcResults || !Array.isArray(qcResults)) return {
      userCounts: {},
      totalSamples: 0,
      selectedSamples: 0,
      filteredData: [],
      userSamplesList: {}
    };

    const userSamples = {};
    const selectedUniqueSamples = new Set();

    // Determine the value key based on the first result
    const firstResult = qcResults[0];
    const valueKey = firstResult.phi_value !== undefined ? 'phi_value' : 'distance';
    
    // Filtered data for display based on the appropriate value key
    const filteredData = qcResults.filter((result) => {
      const value = result[valueKey];
      return valueKey === 'phi_value' ? value < newThreshold : value <= newThreshold;
    });

    // The collaboration data has incorrect sample counts, so let's find the correct source
    // Let's examine the actual data structure to find where the real sample counts are stored
    
    console.log('Full collaboration data:', { creator, invitedUsers });
    console.log('Creator data structure:', creator);
    console.log('Invited users data structure:', invitedUsers);
    
    // Try to find sample counts in different possible locations
    let totalSamples = 0;
    
    // Method 1: Check if samples are stored in a different field
    if (creator?.number_of_samples) {
      totalSamples += parseInt(creator.number_of_samples) || 0;
      console.log('Found creator samples in number_of_samples:', creator.number_of_samples);
    } else if (creator?.samples) {
      totalSamples += parseInt(creator.samples) || 0;
      console.log('Found creator samples in samples field:', creator.samples);
    }
    
    invitedUsers.forEach(user => {
      if (user.number_of_samples) {
        const userSamples = parseInt(user.number_of_samples) || 0;
        totalSamples += userSamples;
        console.log(`${user.name} samples from number_of_samples:`, userSamples);
      } else if (user.samples) {
        const userSamples = parseInt(user.samples) || 0;
        totalSamples += userSamples;
        console.log(`${user.name} samples from samples field:`, userSamples);
      }
    });
    
    console.log('Total calculated samples:', totalSamples);
    console.log('QC results length (pairwise comparisons):', qcResults.length);
    
    // Method 2: Calculate from QC results by identifying unique users and their samples
    // This is the source of truth since it contains the actual processed samples
    const userSampleCounts = {};
    
    qcResults.forEach((result) => {
      const { user1, sample1, user2, sample2 } = result;
      
      // Initialize user sample sets
      if (!userSampleCounts[user1]) userSampleCounts[user1] = new Set();
      if (!userSampleCounts[user2]) userSampleCounts[user2] = new Set();
      
      // Add samples to user sets
      userSampleCounts[user1].add(sample1);
      userSampleCounts[user2].add(sample2);
    });
    
    // Calculate total from QC results (this is the reliable source)
    const totalFromQC = Object.values(userSampleCounts).reduce((sum, samples) => sum + samples.size, 0);
    console.log('User sample counts from QC (source of truth):', Object.fromEntries(
      Object.entries(userSampleCounts).map(([user, samples]) => [user, samples.size])
    ));
    console.log('Total samples from QC results:', totalFromQC);
    
    // Always use QC-based count as it's the source of truth
    totalSamples = totalFromQC;
    console.log('Using QC-based sample count as collaboration data is incorrect');

    // Process ALL QC results to determine sample inclusion
    qcResults.forEach((result) => {
      const { user1, sample1, user2, sample2 } = result;
      const value = result[valueKey];
      
      // Initialize user sets if needed
      if (!userSamples[user1]) userSamples[user1] = new Set();
      if (!userSamples[user2]) userSamples[user2] = new Set();

      // Add/remove samples based on threshold comparison
      // Always keep user1's sample (initiator)
      userSamples[user1].add(sample1);
      
      const shouldKeep = valueKey === 'phi_value' ? value < newThreshold : value <= newThreshold;
      
      if (shouldKeep) {
        userSamples[user2].add(sample2);
      } else {
        userSamples[user2].delete(sample2);
      }
    });

    // Calculate selected samples by summing individual user sample counts
    // This avoids counting duplicates that might appear in multiple pairwise comparisons
    const selectedSamplesCount = Object.values(userSamples).reduce((sum, samples) => sum + samples.size, 0);

    // Convert sets to arrays for output
    const userSamplesList = {};
    Object.keys(userSamples).forEach(user => {
      userSamplesList[user] = Array.from(userSamples[user]);
    });

    return {
      userCounts: Object.fromEntries(
        Object.entries(userSamples).map(([user, samples]) => [user, samples.size])
      ),
      totalSamples: totalSamples,
      selectedSamples: selectedSamplesCount,
      filteredData, // Maintain original filtered data for display
      userSamplesList
    };
  };



  useEffect(() => {
    if (qcResults && newThreshold !== null) {
      const { userCounts, totalSamples, selectedSamples, filteredData, userSamplesList } =
        getGroupedSampleCounts(qcResults, newThreshold);

      setFilteredResults({ userCounts, totalSamples, selectedSamples, filteredData, userSamplesList });
    }
  }, [qcResults, newThreshold]);

  console.log("Total Number of Selected Samples: ",filteredResults?.userSamplesList);
  console.log("Total Number of Samples: ",filteredResults?.totalSamples);


  // const downloadSamples = (samples, filename) => {
  //   try {
  //     if (!samples || samples.length === 0) {
  //       alert("No samples to download.");
  //       return;
  //     }

  //     const jsonContent = JSON.stringify(samples, null, 2);
  //     const blob = new Blob([jsonContent], { type: "application/json" });

  //     const link = document.createElement("a");
  //     const url = window.URL.createObjectURL(blob);
  //     link.href = url;
  //     link.download = filename;
  //     document.body.appendChild(link);
  //     link.click();
  //     window.URL.revokeObjectURL(url);
  //     document.body.removeChild(link);
  //   } catch (error) {
  //     console.error("Download error:", error);
  //     alert(`Download failed: ${error.message}`);
  //   }
  // };


  useEffect(() => {
    // Check QC status when qcScheme is available
    if (qcScheme && qcScheme.length > 0) {
      checkQcStatus();
    }
    checkGwasStatus();
  }, [qcScheme, qcResultsAvailable]);

  const currentUserInfo = getCurrentUserInfo();
  console.log('Number of samples Creator:', creator?.samples, currentUserInfo?.number_of_samples, currentUserInfo?.name, senderInfo?.name);
  const downloadSamples = (samples, filename) => {
    try {
      if (!samples || samples.length === 0) {
        alert("No samples to download.");
        return;
      }

      // Wrap the samples in a list property
      const jsonContent = JSON.stringify({ "Sample IDs": samples }, null, 2);

      const blob = new Blob([jsonContent], { type: "application/json" });

      const link = document.createElement("a");
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
      alert(`Download failed: ${error.message}`);
    }
  };


  const handleSliderChange = (event, newValue) => {
    setNewThreshold(newValue);
    // setThreshold(newValue);
  };

  // Function to get histogram data for current threshold
  const getHistogramData = (threshold) => {
    if (!qcResults || !Array.isArray(qcResults)) return [];
    
    const { userCounts } = getGroupedSampleCounts(qcResults, threshold);
    
    return Object.entries(userCounts).map(([userId, count]) => ({
      userId,
      userName: getUserName(userId),
      sampleCount: count,
      isCurrentUser: userId === current_user_id
    }));
  };

  // Get current histogram data based on newThreshold
  const histogramData = getHistogramData(newThreshold || 0.5);

  // utility functions for Data Export
  const convertToCSV = (data, file_name) => {
    const title = `${file_name} - GWAS Experiment Report`;
    const headers = ['SNP ID,Chi-Square,P-Value'];
    const rows = data.map(snp =>
      `"${snp.snpKey}",${snp.chi},${snp.pValue}`
    );
    return [title, ...headers, ...rows].join('\n');
  };

  const handleDownload = (userId, data) => {
    try {

      let file_name;
      if (userId !== 'aggregated') {
        file_name = getUserName(userId);
      } else {
        file_name = 'Joint'
      }

      const csvContent = convertToCSV(data, file_name);

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = `${file_name}_GWAS_results.csv`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download failed: ${error.message}`);
    }
  };


  const gwasResultPreview = useMemo(() => {
    if (!gwasResults || typeof gwasResults !== 'object') return [];

    return Object.entries(gwasResults).map(([userId, userSnps]) => {
      if (!userSnps || typeof userSnps !== 'object') return { userId, sortedSnps: [] };
      const sortedSnps = Object.entries(userSnps)
        .map(([snpKey, values]) => {
          const chi = values?.chi_square;
          const pValue = values?.p_value;
          return {
            snpKey,
            chi: chi != null ? chi : null,
            pValue: pValue != null ? pValue : null
          };
        })
        .filter(snp => snp.chi != null && snp.pValue != null)
        .sort((a, b) => (a.pValue ?? Infinity) - (b.pValue ?? Infinity));

      return { userId, sortedSnps };
    });
  }, [gwasResults]);

  // console.log('Gwas Results:', gwasResults);


  // Helper functions for collaboration status
  const getAcceptedUsers = () => invitedUsers.filter(user => user.status === 'accepted');
  const getRejectedUsers = () => invitedUsers.filter(user => user.status === 'rejected');
  const getWithdrawnUsers = () => invitedUsers.filter(user => user.status === 'withdrawn');
  const getPendingUsers = () => invitedUsers.filter(user => user.status === 'pending');
  
  // Logic: Collaboration can proceed if either all users accept OR at least one accepts and others have rejected/withdrawn (not pending)
  const userAcceptedInvitation = invitedUsers.length > 0 && (
    invitedUsers.every(user => user.status === 'accepted') || 
    (invitedUsers.some(user => user.status === 'accepted') && 
     invitedUsers.every(user => user.status === 'accepted' || user.status === 'rejected' || user.status === 'withdrawn'))
  );

  const allUsersResponded = invitedUsers.length > 0 && (
  invitedUsers.every(user => user.status !== 'pending'));
  
  // check if all accepted users have uploaded their datasets
  const allAcceptedUsersUploaded = invitedUsers.length > 0 && 
    getAcceptedUsers().every(user => user.is_dataset_uploaded);
  
  // check if sender and collaboration can proceed and all accepted users have uploaded the dataset and qc results are not available
  // For filter-only QC, skip pairwise QC initiation entirely
  const isQcInitiateEnabled = role === 'sender' && allUsersResponded && allAcceptedUsersUploaded && !qcResultsAvailable && !isFilterOnlyQc;
  
  // Debug logging
  console.log('Collaboration Status:', {
    totalInvited: invitedUsers.length,
    accepted: getAcceptedUsers().length,
    rejected: getRejectedUsers().length,
    withdrawn: getWithdrawnUsers().length,
    pending: getPendingUsers().length,
    allUsersResponded,
    allAcceptedUsersUploaded,
    isQcInitiateEnabled,
    role
  });

  const isQcResultsEnabled = !isQcInitiateEnabled && qcResultsAvailable;

  // For filter-only QC: skip threshold step, enable GWAS when all users have surviving data
  const allUsersHaveSurvivingData = isFilterOnlyQc && collaboration?.surviving_samples &&
    Object.keys(collaboration.surviving_samples).length > 0;
  const filterOnlyQcComplete = isFilterOnlyQc && allUsersHaveSurvivingData;

  const isGwasInitiateEnabled =
    role === 'sender' && !gwasResultsAvailable && (
      (qcResultsAvailable && thresholdDefined) || filterOnlyQcComplete
    );

  const isGwasResultsEnabled = !isGwasInitiateEnabled && gwasResultsAvailable;

  useEffect(() => {
    if (isQcResultsEnabled) {
      setActiveStep(1); // Automatically move to next step when QC calculation is ready
    }
    if (isGwasResultsEnabled) {
      setActiveStep(2);
    }
  }, [isQcResultsEnabled, isGwasInitiateEnabled]);

  console.log("QC Results", isQcResultsEnabled);


  const progressSteps = [{
    label: 'Onboarding Collaborators',
    description: !allUsersResponded ? 'Waiting for at least one Collaborator to accept the invitation' : 'Waiting for accepted Collaborators to upload Quality Control data.'
  },
  {
    label: 'QC Calculation',
    description: !qcResultsAvailable ? 'Awaiting the initiator to start the QC calculation' : 'QC results are available, waiting for initator to confirm the Threshold.'
  },
  {
    label: 'Stat Data',
    description: 'Waiting for all parties involved to upload their Stat Data.'
  },
  {
    label: 'Final Experiment',
    description: !gwasResultsAvailable ? 'Awaiting the initiator to perform operations.' : 'Final Results available'
  },
  ];

  const getActiveStep = () => {
    // if collaboration can proceed and accepted users have uploaded datasets
    if (!(allUsersResponded && allAcceptedUsersUploaded)) {
      setProgressActiveStep(0);
      return;
    }
    // if QC Results not available, it stays here
    if (allAcceptedUsersUploaded && !thresholdDefined) {
      setProgressActiveStep(1);
      return;
    }
    // if ((thresholdDefined && Object.keys(gwasResults).length === 0)) {
    //   setProgressActiveStep(2);
    //   return;
    // }

    if ((thresholdDefined || filterOnlyQcComplete) && !collaboration?.stat_uploaded) {
      setProgressActiveStep(2);
      return;
    }

    if ((collaboration?.stat_uploaded && !gwasResultsAvailable)) {
      setProgressActiveStep(3);
      return;
    }

    if ((isGwasResultsEnabled)) {
      setProgressActiveStep(4);
      return;
    }// All steps completed
  };
  useEffect(() => {
    getActiveStep();
  }, [invitedUsers, qcResultsAvailable, thresholdDefined, gwasResultsAvailable, displayQcResults, allUsersResponded, allAcceptedUsersUploaded]);

  // Experiments Tabs:
  const placeholderTabs = ['Chi-Square', 'Odd Ratio', 'GWAS Experiment 3', 'GWAS Experiment 4', 'GWAS Experiment 5'];

  const handleExperimentChange = (index) => {
    if (index === 0) {
      setdisplayQcResults(false);
    } else {
      setdisplayQcResults(true);
    }
  }


  const isFLCollaboration = (experimentList || []).some(exp => {
    if (typeof exp === 'string') return exp === EXPERIMENT_FL;
    if (exp && typeof exp === 'object') {
      if (exp.name === EXPERIMENT_FL) return true;
      if (Array.isArray(exp.experiment_types) && exp.experiment_types.includes(EXPERIMENT_FL)) return true;
    }
    return false;
  });

  if (isFLCollaboration && collaboration) {
    return (
      <FLCollaborationView
        collaboration={{
          ...collaboration,
          uuid: collaborationUuid || uuid,
          current_user_id: senderInfo?.is_sender ? senderInfo?.id : collaboration?.receiver_id,
          creator_id: collaboration?.creator_id || senderInfo?.id,
          is_sender: senderInfo?.is_sender,
          collab_name: collabName,
          invitedUsers,
          all_participants: invitedUsers,
        }}
      />
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" align="left" gutterBottom sx={{ fontWeight: 'light' }}>
        Collaboration Details
      </Typography>

      <Grid container spacing={4}>
        {/* Left Column */}
        <Grid item xs={12} md={8}>
          {/* Collaboration Details Card */}
          {/* <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none', p:0 }}> */}
          <Card sx={{ height: '100%', marginBottom: '20px', p: 0, boxShadow: 'none' }}>
            <CardContent sx={{ p: 0 }}>
              {/* Header */}
              {/* <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  <strong>About Collaboration</strong>
                </Typography>
                <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
                {role === 'sender' && !isEditing && (
                  <Tooltip arrow title="Edit Collaboration Details">
                    <IconButton
                      onClick={() => {
                        // Store original values before editing
                        setOriginalCollabName(collabName);
                        setOriginalExperimentList([...experimentList]);
                        setOriginalPhenoType(phenoType);
                        setOriginalSamples(samples);
                        setIsEditing(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box> */}

              {/* List of Details */}
              <Box sx={{ bgcolor: '#ffffff', p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                <List sx={{ pt: 0, pb: 0 }}>
                  {/* Collaboration Name */}
                  {role === 'sender' ? (
                    isEditing ? (
                      <TextField
                        label="Collaboration Name"
                        variant="outlined"
                        fullWidth
                        sx={{ mt: 2 }}
                        value={collabName}
                        onChange={(e) => setCollabName(e.target.value)}
                      />
                    ) : (
                      <Typography variant="body1">
                        <strong>Title:</strong> {collabName}
                      </Typography>
                    )
                  ) : (
                    <Typography variant="body1">
                      <strong>Title:</strong> {collabName}
                    </Typography>
                  )}
                  {/* Experiments */}
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<strong>Experiments</strong>}
                      secondary={
                        role === 'sender' ? (
                          isEditing ? (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                <TextField
                                  variant="outlined"
                                  value={experimentName}
                                  onChange={(e) => setExperimentName(e.target.value)}
                                  size="small"
                                  sx={{ mr: 2, flexGrow: 1 }}
                                />
                                <Tooltip arrow title="Add a new experiment">
                                  <Button variant="contained" color="primary" startIcon={<Add />} onClick={handleAddExperiment}>
                                    Add
                                  </Button>
                                </Tooltip>
                              </Box>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                                {experimentList.map((experiment, index) => (
                                  <Chip
                                    key={index}
                                    label={experiment}
                                    onDelete={() => handleDeleteExperiment(index)}
                                    color="primary"
                                    variant="outlined"
                                  />
                                ))}
                              </Box>
                            </>
                          ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                              {experimentList.map((experiment, index) => (
                                <Chip key={index} label={experiment} color="primary" variant="outlined" />
                              ))}
                            </Box>
                          )
                        ) : (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {experimentList.map((experiment, index) => (
                              <Chip key={index} label={experiment} color="primary" variant="outlined" />
                            ))}
                          </Box>
                        )
                      }
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />
                  { /* Phenotype & Number of Samples*/}
                  <ListItem disableGutters>
                    <ListItemText
                      primary={
                        <Tooltip arrow title="Phenotypes and Number of Samples from all users" placement="right">
                          <strong>Phenotypes & Number of Samples</strong>
                        </Tooltip>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                          {/* Add the creator's phenotype and samples */}
                          <Tooltip title={`Initiator: ${senderInfo.name}`} arrow>
                            <Chip
                              label={`${creator.phenotype} - ${creator.samples}`}
                              color="primary"
                              variant="contained"
                            />
                          </Tooltip>

                          {/* Add the invited users' phenotypes and samples */}
                          {invitedUsers.map((user, index) => (
                            <Tooltip key={index} title={`Collaborator: ${user.name}`} arrow>
                              <Chip
                                label={`${user.phenotype} - ${user.number_of_samples}`}
                                color="secondary"
                                variant="contained"
                                
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      }
                    />
                  </ListItem>


                  {/* Phenotype */}
                  {/* <ListItem disableGutters>
                    <ListItemText
                      primary={<Tooltip arrow title='Phenotype from Initiator data' placement='right'><strong>Phenotype</strong></Tooltip>}
                      secondary={
                        role === 'sender' ? (
                          isEditing ? (
                            <TextField
                              variant="outlined"
                              fullWidth
                              value={phenoType}
                              onChange={(e) => setPhenotype(e.target.value)}
                            />
                          ) : (
                            <Typography variant="body2">{phenoType}</Typography>
                          )
                        ) : (
                          <Typography variant="body2">{phenoType}</Typography>
                        )
                      }
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<Tooltip arrow title='Samples to be included in this collaboration' placement='right'><strong>Number of Samples</strong></Tooltip>}
                      secondary={
                        <Box display={'inline-flex'} gap={2} sx={{ color: 'text.primary' }}>
                          <Typography variant="body2">{senderInfo?.name} : {creator?.samples}</Typography>
                          <Typography variant="body2">{getCurrentUserInfo()?.name}: {getCurrentUserInfo()?.number_of_samples}</Typography>
                        </Box>
                      }
                    />
                  </ListItem> */}
                  <Divider sx={{ borderColor: 'primary.main' }} />
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<Tooltip arrow title='Quality Control Scheme' placement='right'><strong>QC Scheme</strong></Tooltip>}
                      secondary={
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                          {qcScheme.map((scheme, index) => (
                            <Chip key={index} label={scheme.method || scheme} color="primary" variant="contained" sx={{ backgroundColor: "#D1E3F6", color: '#0D3B69' }} />
                          ))}
                        </Box>
                      }
                    />
                  </ListItem>
                </List>
              </Box>

              {/*Quality Control Data Creation (AUTO) - chained QC runs automatically once collaboration starts */}
              {hasFilterQc && allUsersResponded && (() => {
                const userHasSurvivingData = collaboration?.surviving_samples?.[current_user_id]?.length > 0;
                if (userHasSurvivingData) return false;
                if (role === 'sender') return true;
                const currentUserInvited = invitedUsers.find(u => u.user_id === current_user_id);
                return currentUserInvited?.status === 'accepted';
              })() && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <List>
                    <ListItem sx={{ width: '100%', display: 'block' }}>
                      <ListItemText
                        primary={<Typography variant="h6" fontWeight="bold">QC Dataset Creation</Typography>}
                        secondary={
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            QC datasets are created automatically when the collaboration starts. Selected filter methods:
                            {' '}
                            {qcMethodNames.filter(m => !m.includes('Sample Relatedness') && !m.includes('Population Stratification')).join(' → ')}
                          </Typography>
                        }
                      />
                      <Box sx={{ mt: 2 }}>
                        <Box sx={{ bgcolor: '#e8f1fa', p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', display: 'flex', gap: 2, alignItems: 'center' }}>
                          <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          <Typography variant="body2">
                            Waiting for your QC dataset to be generated automatically. If it takes too long, you can manually retry.
                          </Typography>
                        </Box>
                        <Button
                          variant="outlined" color="primary" fullWidth
                          sx={{ borderRadius: 10 }}
                          disabled={isCreatingQcDataset || !hasFilterQc}
                          onClick={handleChainedQcCreate}
                          startIcon={isCreatingQcDataset ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                          {isCreatingQcDataset ? 'Retrying QC Chain...' : 'Retry QC Dataset Creation'}
                        </Button>
                        {!hasFilterQc && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            No per-user QC methods selected for this collaboration.
                          </Typography>
                        )}
                      </Box>
                    </ListItem>
                  </List>
                </Box>
              )}
              {/* Filter-only QC results: show surviving samples/SNPs directly */}
              {isFilterOnlyQc && collaboration?.surviving_samples?.[current_user_id] && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', flexGrow: 1 }}>QC Filter Results</Typography>
                    <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
                    <Box sx={{ p: 1.5, bgcolor: '#e8f1fa', borderRadius: 2, flex: 1, textAlign: 'center' }}>
                      <Typography variant="h5" color="primary" fontWeight="bold">
                        {collaboration.surviving_samples[current_user_id]?.length || 0}
                      </Typography>
                      <Typography variant="caption">Surviving Samples</Typography>
                    </Box>
                    <Box sx={{ p: 1.5, bgcolor: '#e8f1fa', borderRadius: 2, flex: 1, textAlign: 'center' }}>
                      <Typography variant="h5" color="primary" fontWeight="bold">
                        {collaboration.surviving_snps?.[current_user_id]?.length || 0}
                      </Typography>
                      <Typography variant="caption">Surviving SNPs</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ maxHeight: 300, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 2, p: 1 }}>
                    <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>Samples included in GWAS:</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(collaboration.surviving_samples[current_user_id] || []).map((sample, i) => (
                        <Chip key={i} label={sample} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                </Box>
              )}

              {(isQcInitiateEnabled || isQcResultsEnabled) && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <List sx={{ py: 0 }}>
                    <ListItem disableGutters sx={{ display: 'block', pt: 0, pb: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h2" sx={{ flexGrow: 1, fontSize: 20, fontWeight: 'bold' }}>
                          Quality Control
                        </Typography>
                        <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                      </Box>
                      {(role === 'receiver' && !thresholdDefined) && (
                        <Box sx={{ bgcolor: '#e8f1fa', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2, width: '100%' }} display={'flex'}>
                          <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          <Typography variant="body2">Results will be available soon.</Typography>
                        </Box>
                      )}
                      {role === 'sender' && (
                        <ListItemText
                          sx={{ width: '100%', display: 'block' }}
                          secondary={
                            <Box
                              sx={{
                                display: 'flex',
                                gap: 2,
                                mt: 1,
                                width: '100%', // Ensure the Box takes full width of its parent
                              }}
                            >
                              <Box sx={{ flex: 1, mt: 1 }}>
                                <Tooltip
                                  arrow title={
                                    isQcInitiateLoading || isQcResultsEnabled
                                      ? isQcResultsEnabled
                                        ? 'Get QC Results'
                                        : 'Results not available to preview'
                                      : !isQcInitiateEnabled
                                        ? 'QC calculations already initiated or waiting for Collaborators'
                                        : role === 'receiver'
                                          ? 'Receiver cannot initiate QC calculations'
                                          : 'Initiate QC Calculations'
                                  }
                                  placement="bottom"
                                >
                                  <span>
                                    <Button
                                      variant={isQcResultsEnabled ? "outlined" : "contained"}
                                      color={isQcResultsEnabled ? "secondary" : "primary"}
                                      onClick={isQcResultsEnabled ? handleQcResults : handleQcInitiate}
                                      disabled={
                                        (isQcInitiateLoading && !isQcResultsEnabled) ||
                                        (!isQcInitiateEnabled && !isQcResultsEnabled) ||
                                        isQcResultsLoading ||
                                        role === 'receiver'
                                      }
                                      startIcon={
                                        (isQcInitiateLoading || isQcResultsLoading) && (
                                          <CircularProgress size={20} color="inherit" />
                                        )
                                      }
                                      fullWidth
                                      sx={{ borderRadius: 20 }}
                                    >
                                      {isQcResultsEnabled ? "Get QC Results" : "Initiate QC Calculation"}
                                    </Button>
                                  </span>
                                </Tooltip>
                              </Box>


                              {/* QC Initiate Button */}
                              {/* <Box sx={{ flex: 1 }}>
                                <Tooltip
                                  arrow title={
                                    !isQcInitiateEnabled
                                      ? 'QC calculations already initiated or waiting for Collaborators'
                                      : role === 'receiver'
                                        ? 'Receiver cannot initiate QC calculations'
                                        : 'Initiate QC Calculations'
                                  }
                                  placement="bottom"
                                >
                                  <span>
                                    <Button
                                      variant="contained"
                                      color="primary"
                                      onClick={handleQcInitiate}
                                      disabled={!isQcInitiateEnabled || isQcInitiateLoading}
                                      startIcon={
                                        isQcInitiateLoading && (
                                          <CircularProgress size={20} color="inherit" />
                                        )
                                      }
                                      fullWidth
                                      sx={{ borderRadius: 20 }}
                                    >
                                      Initiate QC Calculation
                                    </Button>
                                  </span>
                                </Tooltip>
                              </Box> */}

                              {/* QC Results Button */}
                              {/* <Box sx={{ flex: 1 }}>
                                <Tooltip
                                  arrow title={
                                    !isQcResultsEnabled
                                      ? 'Results not available to preview'
                                      : role === 'receiver'
                                        ? 'Receiver cannot initiate QC results'
                                        : 'Get QC Results'
                                  }
                                  placement="bottom"
                                >
                                  <span>
                                    <Button
                                      variant="outlined"
                                      color="secondary"
                                      onClick={handleQcResults}
                                      disabled={!isQcResultsEnabled || isQcResultsLoading || role === 'receiver'}
                                      startIcon={
                                        isQcResultsLoading && (
                                          <CircularProgress size={20} color="inherit" />
                                        )
                                      }
                                      fullWidth
                                      sx={{ borderRadius: 20 }}
                                    >
                                      QC Results
                                    </Button>
                                  </span>
                                </Tooltip>
                              </Box> */}
                            </Box>
                          }
                        />
                      )}
                      {/*Place holder for Progress Bar at Receiver's End*/}
                    </ListItem>
                    {(displayQcResults && (role === 'sender' || role === 'receiver')) && (
                      <>
                        {role === 'sender' && (
                          <>
                            {/* For SNP Filter QC methods (MAF, HWE, Missing) - skip threshold, show SNP info */}
                            {isFilterOnlyQc ? (
                              <ListItem disableGutters sx={{ mt: 2 }}>
                                <ListItemText
                                  primary={<strong>SNP Quality Control Results</strong>}
                                  secondary={
                                    <Box sx={{ mt: 1 }}>
                                      <Box sx={{ p: 2, bgcolor: '#e8f1fa', borderRadius: 2, mb: 2 }}>
                                        <Typography variant="body1" fontWeight={500} gutterBottom>
                                          QC Method: {qcScheme.join(', ')}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                          SNP filtering has been applied automatically. Low-quality SNPs have been removed based on the selected QC criteria.
                                        </Typography>
                                      </Box>
                                      
                                      {qcResults && (
                                        <Box sx={{ mb: 2 }}>
                                          <Typography variant="body2" gutterBottom>
                                            <strong>SNPs Retained:</strong> The filtered dataset is ready for GWAS analysis.
                                          </Typography>
                                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, maxHeight: 200, overflow: 'auto', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                            {Array.isArray(qcResults) && qcResults.slice(0, 50).map((result, idx) => (
                                              <Chip 
                                                key={idx} 
                                                label={result.snp_id || result.sample1 || `SNP ${idx + 1}`} 
                                                size="small" 
                                                variant="outlined"
                                                color="primary"
                                              />
                                            ))}
                                            {Array.isArray(qcResults) && qcResults.length > 50 && (
                                              <Chip label={`+${qcResults.length - 50} more`} size="small" color="secondary" />
                                            )}
                                          </Box>
                                        </Box>
                                      )}
                                      
                                      <Button 
                                        variant="contained" 
                                        color="primary" 
                                        onClick={() => {
                                          setThresholdDefined(true);
                                          setThreshold(1); // Set to 1 to indicate no threshold filtering needed
                                        }} 
                                        sx={{ borderRadius: 10 }}
                                        disabled={thresholdDefined}
                                      >
                                        {thresholdDefined ? 'QC Applied' : 'Confirm QC Results'}
                                      </Button>
                                    </Box>
                                  }
                                />
                              </ListItem>
                            ) : (
                            /* For Sample Relatedness & Population Stratification - show threshold slider */
                            <ListItem disableGutters sx={{ mt: 2 }}>
                              <ListItemText
                                primary={<strong>Select Threshold Value</strong>}
                                secondary={
                                  <Box sx={{ mt: 1 }}>
                                    <Slider
                                      value={newThreshold}
                                      onChange={handleSliderChange}
                                      aria-labelledby="threshold-slider"
                                      valueLabelDisplay="auto"
                                      step={0.01}
                                      min={0}
                                      max={1}
                                      sx={{
                                        color: "primary",
                                        height: 8,
                                        "& .MuiSlider-track": { border: "none" },
                                        "& .MuiSlider-thumb": {
                                          height: 24,
                                          width: 24,
                                          backgroundColor: "#fff",
                                          border: "2px solid currentColor",
                                          "&:focus, &:hover, &.Mui-active, &.Mui-focusVisible": { boxShadow: "inherit" },
                                          "&::before": { display: "none" },
                                        },
                                        "& .MuiSlider-valueLabel": {
                                          lineHeight: 1.2,
                                          fontSize: 12,
                                          background: "unset",
                                          padding: 0,
                                          width: 32,
                                          height: 32,
                                          borderRadius: "50% 50% 50% 0",
                                          backgroundColor: "#1876D1",
                                          transformOrigin: "bottom left",
                                          transform: "translate(50%, -100%) rotate(-45deg) scale(0)",
                                          "&::before": { display: "none" },
                                          "&.MuiSlider-valueLabelOpen": { transform: "translate(50%, -100%) rotate(-45deg) scale(1)" },
                                          "& > *": { transform: "rotate(45deg)" },
                                        },
                                      }}
                                    />
                                    <Box sx={{ mb: 1 }}>
                                      <Typography variant="body2" gutterBottom>
                                        Current Threshold: {!thresholdDefined ? 'Please select a threshold.' : threshold}
                                      </Typography>
                                      {((newThreshold !== threshold) &&
                                        <Typography variant="body2" gutterBottom>
                                          New Threshold: {newThreshold}
                                        </Typography>
                                      )}
                                    </Box>

                                    {/* Dynamic Histogram */}
                                    {histogramData.length > 0 && (
                                      <Box sx={{ mt: 3, mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                        <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600 }}>
                                          Sample Count Preview (Threshold: {newThreshold?.toFixed(3)})
                                        </Typography>
                                        
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          {histogramData.map((userData) => {
                                            const maxCount = Math.max(...histogramData.map(d => d.sampleCount));
                                            const totalSamples = histogramData.reduce((sum, d) => sum + d.sampleCount, 0);
                                            const barPercentage = maxCount > 0 ? (userData.sampleCount / maxCount) * 100 : 0;
                                            const samplePercentage = totalSamples > 0 ? (userData.sampleCount / totalSamples) * 100 : 0;
                                            
                                            return (
                                              <Box key={userData.userId} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Box sx={{ minWidth: 120, textAlign: 'right' }}>
                                                  <Typography 
                                                    variant="body2" 
                                                    fontWeight={userData.isCurrentUser ? 600 : 400}
                                                    color={userData.isCurrentUser ? 'primary.main' : 'text.primary'}
                                                  >
                                                    {userData.userName}
                                                  </Typography>
                                                </Box>
                                                
                                                <Box sx={{ flex: 1, position: 'relative', bgcolor: 'grey.100', borderRadius: 1, height: 32 }}>
                                                  <Box
                                                    sx={{
                                                      width: `${Math.max(barPercentage, 10)}%`, // Minimum width for visibility
                                                      height: '100%',
                                                      bgcolor: userData.isCurrentUser ? 'primary.main' : 'secondary.main',
                                                      borderRadius: 1,
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      justifyContent: 'center',
                                                      transition: 'all 0.3s ease',
                                                      opacity: userData.isCurrentUser ? 1 : 0.8,
                                                      position: 'relative'
                                                    }}
                                                  >
                                                    <Typography 
                                                      variant="body2" 
                                                      color="white" 
                                                      fontWeight={600}
                                                      sx={{ 
                                                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                                        fontSize: '0.75rem'
                                                      }}
                                                    >
                                                      {userData.sampleCount} ({samplePercentage.toFixed(1)}%)
                                                    </Typography>
                                                  </Box>
                                                </Box>
                                              </Box>
                                            );
                                          })}
                                        </Box>
                                        
                                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                            Total samples that will be included: {histogramData.reduce((sum, d) => sum + d.sampleCount, 0)}
                                          </Typography>
                                        </Box>
                                      </Box>
                                    )}
                                    <Tooltip arrow title={newThreshold === threshold ? 'Threshold Defined' : 'Confirm your selected threshold value'} placement="bottom">
                                      <Button variant="contained" color="primary" onClick={handleSubmitThreshold} sx={{ borderRadius: 10 }} disabled={newThreshold === threshold}>
                                        {(newThreshold === threshold) ? 'Threshold Defined' : `Confirm Threshold`}
                                      </Button>
                                    </Tooltip>
                                    {/* {matrix.length > 0 ? (
                              <p>
                                Showing {filteredResults.length} out of {matrix.length} groups
                                below threshold ({threshold.toFixed(2)})
                              </p>
                            ) : (
                              <p>No data available</p>
                            )} */}

                                  </Box>
                                }
                              />
                            </ListItem>
                            )}
                            <Divider sx={{ borderColor: 'primary.main' }} />
                          </>
                        )}

                        {/* QC Results Section */}
                        {thresholdDefined && (
                          <ListItem disableGutters sx={{ mt: 1 }}>
                            <ListItemText
                              primary={<strong>QC Results</strong>}
                              secondary={
                                qcResults ? (
                                  <Box>
                                    {/* Total Samples Typography Block */}
                                    <Box sx={{ mb: 2 }}>
                                      <Typography variant="body1" fontWeight={500} color="text.primary">
                                        Total samples to be included in GWAS experiment:{" "}
                                        <Box component="span" fontWeight={700} color="primary.main">
                                          {filteredResults?.selectedSamples || 0}
                                        </Box>{" "}
                                        out of{" "}
                                        <Box component="span" fontWeight={700} color="text.secondary">
                                          {filteredResults?.totalSamples || 0}
                                        </Box>
                                      </Typography>
                                    </Box>

                                    {/* Accordions */}
                                    {Object.entries(filteredResults?.userCounts || {}).map(([userId, count]) => (
                                      <Tooltip
                                        key={userId}
                                        arrow title={userId !== current_user_id ? "You are not allowed to view this collection due to privacy reasons." : ""}
                                      >
                                        <Box>
                                          <Accordion
                                            disabled={userId !== current_user_id}
                                            expanded={userId === current_user_id ? undefined : false}
                                            elevation={0}
                                            sx={{
                                              mb: '10px !important',
                                              border: '1px solid',
                                              borderRadius: '12px !important',
                                              borderColor: 'divider',
                                              overflow: 'hidden',
                                              '&:before': { display: 'none' },
                                              '&.Mui-disabled': {
                                                opacity: 1,
                                                pointerEvents: 'none',
                                                bgcolor: 'action.hover',
                                                borderRadius: 3
                                              },
                                              '&.Mui-expanded': {
                                                transition: 'all 0.3s ease',
                                              }
                                            }}
                                          >
                                            <AccordionSummary
                                              expandIcon={userId === current_user_id ? null : <ExpandMoreIcon />}
                                              sx={{
                                                px: 3,
                                                borderRadius: 3,
                                                '&:hover': { bgcolor: 'action.hover' },
                                                // Disable rotation only for current user
                                                ...(userId === current_user_id && {
                                                  '& .MuiAccordionSummary-expandIconWrapper': {
                                                    transform: 'none !important',
                                                  },
                                                  '& .Mui-expanded .MuiAccordionSummary-expandIconWrapper': {
                                                    transform: 'none !important',
                                                  },
                                                }),
                                              }}
                                            >
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                                {/* Existing avatar and user info */}
                                                <Box
                                                  sx={{
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: '50%',
                                                    bgcolor: userId === current_user_id ? 'primary.main' : 'grey.300',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid',
                                                    borderColor: userId === current_user_id ? 'primary.dark' : 'divider',
                                                    '&::after': userId !== current_user_id ? undefined : {
                                                      content: '""',
                                                      width: 14,
                                                      height: 14,
                                                      borderRadius: '50%',
                                                      bgcolor: 'white'
                                                    }
                                                  }}
                                                />
                                                <Box sx={{ flexGrow: 1 }}>
                                                  <Typography
                                                    variant="subtitle1"
                                                    fontWeight={600}
                                                    color={userId === current_user_id ? 'primary.main' : 'text.primary'}
                                                    sx={{ letterSpacing: '-0.02em' }}
                                                  >
                                                    {getUserName(userId)}
                                                  </Typography>
                                                  <Typography
                                                    variant="body2"
                                                    color={userId === current_user_id ? 'primary.dark' : 'text.secondary'}
                                                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                                                  >
                                                    <Box component="span" fontWeight={500}>{count} Samples</Box>
                                                    <Box component="span" sx={{ color: 'text.disabled' }}>•</Box>
                                                    <Box component="span">{userId === current_user_id ? 'Your collection' : 'Collaborator'}</Box>
                                                  </Typography>
                                                </Box>

                                                {userId === current_user_id && (
                                                  <>
                                                    {userId === current_user_id && filteredResults.userSamplesList[userId]?.length > 0 && (
                                                      <Box>
                                                        <Button
                                                          fullWidth
                                                          variant="contained"
                                                          size="small"
                                                          onClick={() => downloadSamples(filteredResults.userSamplesList[userId], 'my_samples.json')}
                                                          endIcon={<DownloadRounded sx={{ fontSize: '10px' }} />}
                                                          sx={{
                                                            borderRadius: 10,
                                                            boxShadow: 0,
                                                            bgcolor: 'primary.main',
                                                            fontSize: 10,
                                                            '&:hover': {
                                                              bgcolor: 'primary.dark'
                                                            }
                                                          }}
                                                        >
                                                          Export Your Samples
                                                        </Button>
                                                      </Box>
                                                    )}
                                                    <Box
                                                      sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                      }}
                                                    >
                                                      <Button
                                                        fullWidth
                                                        variant="outlined"
                                                        size="small"
                                                        sx={{
                                                          borderRadius: 10,
                                                          boxShadow: 0,
                                                          fontSize: 10,
                                                        }}
                                                      >
                                                        Preview
                                                      </Button>
                                                    </Box>
                                                  </>
                                                )}
                                              </Box>
                                            </AccordionSummary>

                                            <AccordionDetails sx={{ pt: 2, pb: 2, px: 3, height: '400px', }}>
                                              {filteredResults.userSamplesList[userId] && filteredResults.userSamplesList[userId].length > 0 ? (
                                                <Box sx={{
                                                  height: 'calc(100%)',
                                                  overflowY: 'auto',
                                                  pr: 1,
                                                }}>
                                                  {filteredResults.userSamplesList[userId].map((sample, index) => (
                                                    <Box
                                                      key={index}
                                                      sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        py: 1.5,
                                                        px: 2,
                                                        bgcolor: 'background.paper',
                                                        mb: 1,
                                                        borderRadius: 3,
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                      }}
                                                    >
                                                      <Box sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        bgcolor: 'primary.main',
                                                        mr: 2,
                                                        flexShrink: 0
                                                      }} />
                                                      <Typography
                                                        variant="body1"
                                                        fontFamily="monospace"
                                                        sx={{
                                                          fontWeight: 500,
                                                          color: 'text.primary',
                                                          wordBreak: 'break-word'
                                                        }}
                                                      >
                                                        {sample}
                                                      </Typography>
                                                    </Box>
                                                  ))}
                                                </Box>
                                              ) : (
                                                <Typography
                                                  variant="body2"
                                                  color="text.secondary"
                                                  sx={{
                                                    py: 2,
                                                    px: 3,
                                                    bgcolor: 'action.hover',
                                                    borderRadius: 3,
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    textAlign: 'center'
                                                  }}
                                                >
                                                  No contributions recorded yet
                                                </Typography>
                                              )}


                                            </AccordionDetails>
                                          </Accordion>
                                        </Box>
                                      </Tooltip>
                                    ))}
                                  </Box>



                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    No QC results to display.
                                  </Typography>
                                )
                              }
                            />
                          </ListItem>
                        )}
                      </>
                    )}
                    <>
                      <ListItem disableGutters>
                        {((thresholdDefined || filterOnlyQcComplete) && !collaboration?.stat_uploaded) && (
                          <>
                            {collaboration?.missing_stat_user?.includes(current_user_id) ? (<ListItemText
                              primary={
                                <Box sx={{
                                  position: 'relative',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  width: '100%',
                                  pr: 4 // Right padding for icon spacing
                                }}>
                                  <strong>Stat Data</strong>
                                  <Accordion
                                    expanded={expanded}
                                    onChange={() => setExpanded(!expanded)}
                                    sx={{
                                      position: 'absolute',
                                      right: 0,
                                      m: 0,
                                      bgcolor: 'transparent',
                                      boxShadow: 'none',
                                      '&:before': { display: 'none' },
                                      '&.Mui-expanded': {
                                        margin: '0 !important',
                                        position: 'absolute',
                                        zIndex: 1
                                      }
                                    }}
                                  >
                                    <AccordionSummary
                                      expandIcon={
                                        <Tooltip title="Show Instructions" arrow placement='left'>
                                          <Box display={'inline-flex'} sx={{ gap: 1 }}>
                                            <Button
                                              fullWidth
                                              variant="contained"
                                              size="small"
                                              endIcon={<InfoIcon />}
                                              sx={{
                                                borderRadius: 10,
                                                boxShadow: 0,
                                                fontSize: 10,
                                                bgcolor: '#e8f1fa',
                                                color: 'primary.main',
                                                '&:hover': { color: 'white' }
                                              }}
                                            >
                                              Learn More
                                            </Button>
                                          </Box>
                                        </Tooltip>
                                      }
                                      sx={{
                                        p: 0,
                                        minHeight: 'auto !important',
                                        '& .MuiAccordionSummary-expandIconWrapper': {
                                          transform: 'none !important'
                                        },
                                        '&.Mui-expanded .MuiAccordionSummary-expandIconWrapper': {
                                          transform: 'none !important'
                                        },
                                        '& .MuiAccordionSummary-content': {
                                          m: '0 !important',
                                          flexGrow: 0
                                        },
                                        '&.Mui-expanded': {
                                          minHeight: 'auto !important'
                                        }
                                      }}

                                    />
                                  </Accordion>
                                </Box>
                              }
                              secondary={
                                <>
                                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
                                    <Button
                                      variant="contained"
                                      color="primary"
                                      disabled={isCreatingGwasDataset || !(
                                        filteredResults?.userSamplesList?.[current_user_id]?.length ||
                                        collaboration?.surviving_samples?.[current_user_id]?.length
                                      )}
                                      onClick={handleCreateGwasDataset}
                                      sx={{ borderRadius: 2, textTransform: 'none' }}
                                    >
                                      {isCreatingGwasDataset ? 'Creating...' : 'Create GWAS Dataset from QC Sample List'}
                                    </Button>
                                    {(filteredResults?.userSamplesList?.[current_user_id]?.length > 0 ||
                                      collaboration?.surviving_samples?.[current_user_id]?.length > 0) && (
                                      <Typography variant="caption" color="text.secondary">
                                        {filteredResults?.userSamplesList?.[current_user_id]?.length ||
                                         collaboration?.surviving_samples?.[current_user_id]?.length || 0} samples from QC
                                      </Typography>
                                    )}
                                  </Box>
                                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    Or upload stat file manually:
                                  </Typography>
                                  <AccordionDetails sx={{
                                    p: expanded ? 2 : 0,
                                    bgcolor: '#e8f1fa',
                                    borderRadius: '11px',
                                    mt: 1,
                                    display: expanded ? 'block' : 'none'
                                  }}>
                                    <Typography variant="body1" sx={{
                                      pb: 0.5,
                                      mb: 1,
                                      color: 'text.primary',
                                      borderBottom: '1px solid',
                                      borderColor: 'divider',
                                      fontWeight: 500
                                    }}>
                                      Instructions
                                    </Typography>
                                    <Box sx={{ position: 'relative' }}>
                                      {/* Download Section */}
                                      <Box sx={{ mb: 3, display: 'flex', position: 'relative' }}>
                                        <ArrowRightIcon sx={{
                                          fontSize: '20px',
                                          color: 'primary.main',
                                          flexShrink: 0,
                                          mt: '2px'
                                        }} />
                                        <Box sx={{ flexGrow: 1, ml: 1.5 }}>
                                          <Typography variant="body2" sx={{
                                            mb: 1.5,
                                            color: 'text.primary',
                                            fontWeight: 500
                                          }}>
                                            Download Script to Generate Stat Data
                                          </Typography>
                                          <Button
                                            variant="outlined"
                                            size="small"
                                            endIcon={<DownloadRounded />}
                                            sx={{
                                              borderRadius: 10,
                                              boxShadow: 'none',
                                              textTransform: 'none',
                                              '&:hover': { boxShadow: 'none' }
                                            }}
                                          >
                                            Python Script
                                          </Button>
                                          <Typography variant="caption" color="text.secondary" sx={{
                                            display: 'block',
                                            mt: 1,
                                            fontSize: '0.75rem'
                                          }}>
                                            Python script for standardized SNP data formatting
                                          </Typography>
                                        </Box>
                                      </Box>

                                      {/* Format Section */}
                                      <Box sx={{ mb: 3, display: 'flex' }}>
                                        <ArrowRightIcon sx={{
                                          fontSize: '20px',
                                          color: 'primary.main',
                                          flexShrink: 0,
                                          mt: '2px'
                                        }} />
                                        <Box sx={{ flexGrow: 1, ml: 1.5 }}>
                                          <Typography variant="body2" sx={{
                                            mb: 1.5,
                                            color: 'text.primary',
                                            fontWeight: 500
                                          }}>
                                            Accepted Formats
                                          </Typography>
                                          <Box sx={{ display: 'flex', gap: 1.5 }}>
                                            <Chip
                                              label="CSV"
                                              color="primary"
                                              size="small"
                                              variant="outlined"
                                              icon={<CheckCircleIcon fontSize="small" />}
                                              sx={{ borderRadius: 3, fontWeight: 500 }}
                                            />
                                            <Chip
                                              label="JSON"
                                              color="primary"
                                              size="small"
                                              variant="outlined"
                                              icon={<CheckCircleIcon fontSize="small" />}
                                              sx={{ borderRadius: 3, fontWeight: 500 }}
                                            />
                                          </Box>
                                        </Box>
                                      </Box>

                                      {/* Example Preview */}
                                      <Box sx={{ mb: 2, display: 'flex' }}>
                                        <ArrowRightIcon sx={{
                                          fontSize: '20px',
                                          color: 'primary.main',
                                          flexShrink: 0,
                                          mt: '2px'
                                        }} />
                                        <Box sx={{ flexGrow: 1, ml: 1.5 }}>
                                          <Typography variant="body2" sx={{
                                            mb: 1.5,
                                            color: 'text.primary',
                                            fontWeight: 500
                                          }}>
                                            File Structure Example
                                          </Typography>
                                          <Box sx={{
                                            border: '1px solid',
                                            borderColor: 'primary.main',
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            bgcolor: 'common.white',
                                            maxWidth: 400
                                          }}>
                                            <img
                                              src={statSampleImage}
                                              alt="File format example"
                                              style={{
                                                width: '100%',
                                                objectFit: 'contain',
                                                padding: 5,
                                                borderRadius: 10
                                              }}
                                            />
                                          </Box>
                                          <Typography variant="caption" color="text.secondary" sx={{
                                            display: 'block',
                                            mt: 1,
                                            fontSize: '0.75rem'
                                          }}>
                                            Required columns: snp_ids, case, controls
                                          </Typography>
                                        </Box>
                                      </Box>
                                    </Box>
                                  </AccordionDetails>

                                  {/* File Upload Section */}
                                  <Tooltip placement="bottom" arrow title={file ? "File already selected" : "Upload file must be in CSV or JSON format."}>
                                    <span>
                                      <Button
                                        variant="outlined"
                                        component="label"
                                        fullWidth
                                        sx={{ mt: 1, borderRadius: 10 }}
                                      >
                                        {file ? file.name : "Select Stat Data"}
                                        <input type="file" hidden onChange={handleFileUpload} />
                                      </Button>
                                    </span>
                                  </Tooltip>

                                  {/* Submit Button */}
                                  {file && (
                                    <>
                                      <Button variant="contained" color="primary" fullWidth sx={{ mt: 2, borderRadius: 10 }} onClick={handleSubmitStat}>
                                        Submit Stat Data
                                      </Button>
                                      <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2 }} display={'flex'}>
                                        <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                        <Typography variant="body2">{file.name} will be linked to {creator.phenotype} for this collaboration.</Typography>
                                      </Box>
                                    </>
                                  )}
                                </>
                              }
                              sx={{
                                '& .MuiListItemText-primary': {
                                  width: '100%',
                                  display: 'block'
                                },
                                '& .MuiListItemText-secondary': {
                                  width: '100%'
                                }
                              }}
                            />) : (
                              <Box sx={{ bgcolor: '#e8f1fa', p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2, width: '100%' }} display={'flex'}>
                                <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                <Typography variant="body2">Waiting for Collaborators to upload their Stat data.</Typography>
                              </Box>
                            )}
                          </>
                        )}
                      </ListItem>
                    </>
                  </List>
                </Box>
              )}
              {collaboration?.stat_uploaded && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <List sx={{ pt: 0 }}>
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h2" sx={{ flexGrow: 1, fontSize: 20, fontWeight: 'bold' }}>
                          Experiment Results
                        </Typography>
                        <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                      </Box>
                      {(role === 'receiver' && !gwasResultsAvailable) && (
                        <Box sx={{ bgcolor: '#e8f1fa', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2, width: '100%' }} display={'flex'}>
                          <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          <Typography variant="body2">Results will be available soon.</Typography>
                        </Box>
                      )}
                      {role === 'sender' && (
                        <ListItem disableGutters>
                          <ListItemText
                            secondary={
                              <Box
                                sx={{
                                  display: 'flex',
                                  gap: 2,
                                  mt: 1,
                                  width: '100%', // Ensure the Box takes full width of its parent
                                }}
                              >
                                <Box sx={{ flex: 1 }}>
                                  <Tooltip
                                    arrow title={
                                      isGwasResultsEnabled
                                        ? 'Get Results'
                                        : !isGwasInitiateEnabled
                                          ? 'Calculation already Initiated'
                                          : role === 'receiver'
                                            ? 'Receiver cannot initiate calculations'
                                            : 'Initiate Calculations'
                                    }
                                    placement="bottom"
                                  >
                                    <span>
                                      <Button
                                        variant={isGwasResultsEnabled ? "outlined" : "contained"}
                                        color={isGwasResultsEnabled ? "secondary" : "primary"}
                                        onClick={isGwasResultsEnabled ? handleGwasResults : handleGwasInitiate}
                                        disabled={
                                          (!isGwasInitiateEnabled && !isGwasResultsEnabled) ||
                                          role === 'receiver' ||
                                          isGwasInitiateLoading
                                        }
                                        fullWidth
                                        sx={{ borderRadius: 20 }}
                                        startIcon={
                                          isGwasInitiateLoading && (
                                            <CircularProgress size={20} color="inherit" />
                                          )
                                        }
                                      >
                                        {isGwasResultsEnabled ? "Get GWAS Results" : 
                                         isGwasInitiateLoading ? "Initiating..." : "Initiate GWAS Calculation"}
                                      </Button>
                                    </span>
                                  </Tooltip>
                                </Box>
                                


                                {/* GWAS Initiate Button */}
                                {/* <Box sx={{ flex: 1 }}>
                                  <Tooltip
                                    arrow title={
                                      !isGwasInitiateEnabled
                                        ? 'GWAS Calculation already Initiated or Users yet to upload Stat Data'
                                        : role === 'receiver'
                                          ? 'Receiver cannot initiate QC calculations'
                                          : 'Initiate GWAS Calculations'
                                    }
                                    placement="bottom"
                                  >
                                    <span>
                                      <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleGwasInitiate}
                                        disabled={!isGwasInitiateEnabled}
                                        fullWidth
                                        sx={{ borderRadius: 20 }}
                                      >
                                        Initiate GWAS Calculation
                                      </Button>
                                    </span>
                                  </Tooltip>
                                </Box> */}

                                {/* GWAS Results Button */}
                                {/* <Box sx={{ flex: 1 }}>
                                  <Tooltip
                                    arrow title={
                                      !isGwasResultsEnabled
                                        ? 'Results not available to preview' : role === 'receiver'
                                          ? 'Receiver cannot initiate GWAS results'
                                          : 'Get GWAS Results'
                                    }
                                    placement="bottom"
                                  >
                                    <span>
                                  <Button
                                    variant="outlined"
                                    color="secondary"
                                    onClick={handleGwasResults}
                                    // startIcon={
                                    //   isQcResultsLoading && (
                                    //     <CircularProgress size={20} color="inherit" />
                                    //   )
                                    // }
                                    fullWidth
                                    sx={{ borderRadius: 20 }}
                                  >
                                    Get Results
                                  </Button>
                                </span>
                                  </Tooltip>
                                </Box> */}
                              </Box>
                            }
                          />
                        </ListItem>
                      )}
                    </>
                    {(gwasResultsAvailable) && (
                      <Box sx={{ mt: 2 }}>
                        {/* <Typography variant="h6" gutterBottom>
                          <strong>GWAS Experiment</strong>
                        </Typography> */}

                        <Tabs
                          value={selectedTab}
                          onChange={(event, newValue) => {
                            if (selectedTab !== 0) {
                              setSelectedTab(newValue);
                            }
                          }}
                          variant="scrollable"
                          scrollButtons="auto"
                          sx={{
                            borderBottom: 1,
                            bgcolor: 'white',
                            border: 1,
                            borderRadius: 3,
                            borderColor: '#85b1e6'
                          }}
                        >
                          {placeholderTabs.map((tab, index) => (
                            selectedTab === 0 && index !== 0 ? (
                              <Tooltip key={index} title="Results not available" arrow>
                                <span>
                                  <Tab label={tab} disabled />
                                </span>
                              </Tooltip>
                            ) : (
                              <Tab key={index} label={tab} />
                            )
                          ))}
                        </Tabs>


                        {/* {gwasResultPreview.map((userData) => (
                          <Box key={userData.userId} sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, borderRadius: 2, border: 1, borderColor: '#85b1e6', p: 1 }}>
                              <Typography variant="title" sx={{ fontWeight: 'bold' }}>
                                {getUserName(userData.userId)} - SNP Results
                              </Typography>

                              <Button
                                variant="contained"
                                size="small"
                                color="primary"
                                sx={{ borderRadius: 10, fontSize: 10 }}
                                endIcon={<DownloadRounded />}
                                onClick={() => handleDownload(userData.userId, userData.sortedSnps)}
                              >
                                Download Results
                              </Button>
                            </Box>


                            <TableContainer sx={{ maxHeight: 400, overflow: "auto", borderRadius: 2, border: 1, borderColor: '#cccccc', marginTop: 2 }}>
                              <Table stickyHeader>
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ backgroundColor: "#1876D1", color: "white", fontWeight: "bold", position: "sticky", top: 0, zIndex: 1 }} align='center'>SNP</TableCell>
                                    <TableCell sx={{ backgroundColor: "#1876D1", color: "white", fontWeight: "bold", position: "sticky", top: 0, zIndex: 1 }} align='center'>Chi-Square</TableCell>
                                    <TableCell sx={{ backgroundColor: "#1876D1", color: "white", fontWeight: "bold", position: "sticky", top: 0, zIndex: 1 }} align='center'>P-Value</TableCell>
                                  </TableRow>
                                </TableHead>

                                <TableBody>
                                  {userData.sortedSnps.map((snp) => (
                                    <TableRow key={snp.snpKey}>
                                      <TableCell align='center'>{snp.snpKey}</TableCell>
                                      <TableCell align='center'>{snp.chi.toFixed(3)}</TableCell>
                                      <TableCell align='center'>{snp.pValue.toFixed(3)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        ))} */}

                        <Box sx={{ pt: 2 }}>
                          {selectedTab === 0 && (
                            <Box>
                              {gwasResultPreview
                                .filter(userData => userData.userId === current_user_id || userData.userId === "aggregated") // Keep only the current user and combined data
                                .map(userData => (
                                  <Box key={userData.userId} sx={{ mb: 4 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, borderBottom: 1, borderColor: 'divider', p: 1 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {userData.userId === "aggregated" ? "Joint Results: Chi-Square" : `Individual Results: Chi-Square`}
                                      </Typography>
                                      <Button
                                        variant="contained"
                                        size="small"
                                        color="primary"
                                        sx={{ borderRadius: 10, fontSize: 10, boxShadow: 0 }}
                                        endIcon={<DownloadRounded />}
                                        onClick={() => handleDownload(userData.userId, userData.sortedSnps)}
                                      >
                                        Download Results
                                      </Button>
                                    </Box>
                                    <TableContainer sx={{ maxHeight: 400, overflow: 'auto', borderRadius: 2, border: 1, borderColor: '#a3c8ed', mt: 2 }}>
                                      <Table stickyHeader>
                                        <TableHead>
                                          <TableRow>
                                            <TableCell align="center" sx={{ bgcolor: '#d1e4f6', color: '#0c3b69', fontWeight: 'bold' }}>SNP</TableCell>
                                            <TableCell align="center" sx={{ bgcolor: '#d1e4f6', color: '#0c3b69', fontWeight: 'bold' }}>Chi-Square</TableCell>
                                            <TableCell align="center" sx={{ bgcolor: '#d1e4f6', color: '#0c3b69', fontWeight: 'bold' }}>P-Value</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {userData.sortedSnps.map(snp => (
                                            <TableRow key={snp.snpKey}>
                                              <TableCell align="center">{snp.snpKey}</TableCell>
                                              <TableCell align="center">{snp.chi != null ? Number(snp.chi).toFixed(3) : 'N/A'}</TableCell>
                                              <TableCell align="center">{snp.pValue != null ? Number(snp.pValue).toFixed(3) : 'N/A'}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Box>
                                ))}
                            </Box>

                          )}
                          {selectedTab !== 0 && (
                            <Typography variant="body1">Placeholder content for {placeholderTabs[selectedTab]}</Typography>
                          )}
                        </Box>
                      </Box>
                    )}
                    {role === 'sender' && gwasResultsAvailable && (
                      <GwasSummaryCard
                        summary={aiSummary}
                        loading={aiSummaryLoading}
                        error={aiSummaryError}
                        onGenerate={handleGenerateAiSummary}
                        invitedUsers={invitedUsers}
                        senderInfo={senderInfo}
                      />
                    )}
                  </List>
                </Box>
              )}
              {/* Save and Cancel Buttons */}
              {/* {isEditing && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Tooltip arrow title="Save your changes" placement="top">
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<SaveIcon />}
                      onClick={handleUpdateCollaboration}
                      sx={{ mr: 2 }}
                      disabled={isLoading}
                    >
                      {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Save'}
                    </Button>
                  </Tooltip>
                  <Tooltip arrow title="Cancel editing" placement="top">
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<CancelIcon />}
                      onClick={() => {
                        // Revert to original values
                        setCollabName(originalCollabName);
                        setExperimentList([...originalExperimentList]);
                        setPhenotype(originalPhenoType);
                        setSamples(originalSamples);
                        setIsEditing(false);
                      }}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </Tooltip>
                </Box>
              )} */}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', marginBottom: '20px', p: 0, boxShadow: 'none' }}>
            <CardContent sx={{ p: 0 }}>
              {/* Header */}
              <Box sx={{ bgcolor: '#ffffff', p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    <strong>Collaborators</strong>
                  </Typography>
                  <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                </Box>
                <List>
                  <ListItem disableGutters>
                    <ListItemText
                      primary={`${senderInfo.name} (Initiator)`}
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />

                  {invitedUsers.map((user, index) => (
                    <ListItem key={index} disableGutters sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ListItemText
                        primary={`${user.name} (Collaborator)`}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {role === 'sender' && user.status === 'pending' ? (
                          <Tooltip arrow title="Withdraw this invitation" placement="top">
                            <Button
                              variant="outlined"
                              color="secondary"
                              size="small"
                              onClick={() => handleWithdraw(user.user_id)}
                              sx={{ borderRadius: 10 }}
                            >
                              Withdraw
                            </Button>
                          </Tooltip>
                          // Modify
                        ) : role === 'receiver' && current_user_id == user.user_id && user.status === 'pending' ? (
                          <>
                            <Tooltip arrow title="Accept this invitation" placement="top">
                              <Button
                                variant="contained"
                                color="primary"
                                size="small"
                                startIcon={<CheckCircleIcon />}
                                onClick={() => handleAccept(user.user_id)}
                                sx={{ mr: 1, borderRadius: 10 }}
                              >
                                Accept
                              </Button>
                            </Tooltip>
                            <Tooltip arrow title="Reject this invitation" placement="top">
                              <Button
                                variant="outlined"
                                color="primary"
                                size="small"
                                onClick={() => handleReject(user.user_id)}
                                startIcon={<CancelIcon />}
                                sx={{ borderRadius: 10 }}
                              >
                                Reject
                              </Button>
                            </Tooltip>
                          </>
                        ) : (
                          <StatusChip status={user.status} />
                        )}
                      </Box>
                    </ListItem>
                  ))}
                </List>
              </Box>
              <Box sx={{ bgcolor: '#ffffff', p: 2, mt: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    <strong>Collaboration Status</strong>
                  </Typography>
                  <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                </Box>
                {/*Will have the progress bar here*/}
                <Stepper activeStep={progressActiveStep} orientation="vertical">
                  {progressSteps.map((step, index) => (
                    <Step key={index}>
                      <StepLabel>{step.label}</StepLabel>
                      <StepContent>{step.description}</StepContent>
                    </Step>
                  ))}
                </Stepper>


              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* <Box mt={4}>
        <Tooltip arrow title="Save your collaboration details" placement="top">
          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={handleUpdateCollaboration}
            disabled={isLoading || !isEditing} // Disable if not in edit mode
            sx={{ py: 2, fontSize: '1.1rem', borderRadius: 100 }}
          >
            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Update Collaboration'}
          </Button>
        </Tooltip>
      </Box> */}

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container >
  );
};

// Minimal markdown renderer for LLM section strings.
// Supports: paragraphs, "- " / "* " bullet lists, **bold**, `code`, scientific p-values.
const renderSimpleMarkdown = (text) => {
  if (!text || typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let bulletBuffer = [];
  const flushBullets = () => {
    if (bulletBuffer.length) {
      blocks.push({ type: 'ul', items: bulletBuffer });
      bulletBuffer = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushBullets(); continue; }
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
    } else {
      flushBullets();
      blocks.push({ type: 'p', text: line });
    }
  }
  flushBullets();

  const formatInline = (s) => {
    const parts = [];
    const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(s)) !== null) {
      if (match.index > lastIndex) {
        parts.push(s.slice(lastIndex, match.index));
      }
      if (match[1] !== undefined) {
        parts.push(<strong key={`b${key++}`}>{match[1]}</strong>);
      } else if (match[2] !== undefined) {
        parts.push(<code key={`c${key++}`} style={{ background: '#f3f4f6', padding: '0 4px', borderRadius: 3, fontFamily: 'monospace' }}>{match[2]}</code>);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < s.length) parts.push(s.slice(lastIndex));
    return parts;
  };

  return blocks.map((block, i) => {
    if (block.type === 'ul') {
      return (
        <Box key={`b${i}`} component="ul" sx={{ pl: 3, mb: 1.5, mt: 0.5 }}>
          {block.items.map((item, j) => (
            <li key={j} style={{ marginBottom: 4 }}>
              <Typography variant="body2" component="span" sx={{ lineHeight: 1.6 }}>
                {formatInline(item)}
              </Typography>
            </li>
          ))}
        </Box>
      );
    }
    return (
      <Typography key={`b${i}`} variant="body2" sx={{ mb: 1.5, lineHeight: 1.6 }}>
        {formatInline(block.text)}
      </Typography>
    );
  });
};

const VERDICT_STYLE = {
  continue: { label: 'Recommended: Continue', bg: '#e8f5e9', dot: '#2e7d32', border: '#a5d6a7' },
  continue_with_caveats: { label: 'Continue with Caveats', bg: '#fff8e1', dot: '#ed6c02', border: '#ffcc80' },
  reconsider: { label: 'Reconsider Collaboration', bg: '#fdecea', dot: '#c62828', border: '#ef9a9a' },
};

const GwasSummaryCard = ({
  summary,
  loading,
  error,
  onGenerate,
  invitedUsers = [],
  senderInfo = {},
}) => {
  const generatedAt = summary?.generated_at ? new Date(summary.generated_at) : null;
  const content = summary?.content || null;
  const recommendation = content?.recommendation || null;
  const verdictKey = recommendation?.verdict || 'continue_with_caveats';
  const verdict = VERDICT_STYLE[verdictKey] || VERDICT_STYLE.continue_with_caveats;
  const labelMap = summary?.site_label_map || {};

  // Reverse map: user_id -> site label, so we can offer a "Show real names" hint.
  const siteEntries = Object.entries(labelMap).map(([label, userId]) => {
    let realName = null;
    if (senderInfo?.id && String(senderInfo.id) === String(userId)) {
      realName = `${senderInfo.name || ''} (Initiator)`.trim();
    } else {
      const match = invitedUsers.find((u) => String(u.user_id) === String(userId));
      if (match) realName = match.name;
    }
    return { label, realName };
  });

  return (
    <Box
      sx={{
        mt: 2,
        p: 0,
        borderRadius: 3,
        border: 1,
        borderColor: '#85b1e6',
        bgcolor: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: '#e3eaf5',
          bgcolor: '#f7fafd',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <SummarizeIcon sx={{ mr: 1, color: '#1876D1' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Result Summary</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {generatedAt && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Generated {generatedAt.toLocaleString()}
            </Typography>
          )}
          <Button
            size="small"
            variant={summary ? 'outlined' : 'contained'}
            color="primary"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : (summary ? <RefreshIcon /> : <SummarizeIcon />)}
            onClick={onGenerate}
            disabled={loading}
            sx={{ borderRadius: 10, textTransform: 'none' }}
          >
            {loading ? 'Generating…' : (summary ? 'Regenerate' : 'Generate Summary')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ p: 2.5 }}>
        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!summary && !loading && !error && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              Generate a one-page summary of the joint and individual chi-square results,
              including a recommendation on whether this collaboration is a good fit to continue.
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Uses aggregated statistics only. No raw genotypes or sample IDs are used.
            </Typography>
          </Box>
        )}

        {loading && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" sx={{ mt: 1.5, color: 'text.secondary' }}>
              Analyzing aggregated chi-square results…
            </Typography>
          </Box>
        )}

        {!loading && summary && content && (
          <>
            {recommendation && (
              <Box
                sx={{
                  mb: 2.5,
                  p: 2,
                  borderRadius: 2,
                  border: 1,
                  borderColor: verdict.border,
                  bgcolor: verdict.bg,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: verdict.dot, mr: 1 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: verdict.dot, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {verdict.label}
                  </Typography>
                </Box>
                {recommendation.headline && (
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                    {recommendation.headline}
                  </Typography>
                )}
                {recommendation.rationale && (
                  <Box sx={{ mb: 1 }}>{renderSimpleMarkdown(recommendation.rationale)}</Box>
                )}
                {recommendation.next_steps && (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 1.5, mb: 0.5 }}>
                      Recommended next steps
                    </Typography>
                    {renderSimpleMarkdown(recommendation.next_steps)}
                  </>
                )}
              </Box>
            )}

            {content.overview && (
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1876D1', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                  Overview
                </Typography>
                {renderSimpleMarkdown(content.overview)}
              </Box>
            )}

            {content.top_snps && (
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1876D1', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                  Top SNPs driving the signal
                </Typography>
                {renderSimpleMarkdown(content.top_snps)}
              </Box>
            )}

            {content.per_collaborator && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1876D1', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                  Per-collaborator contribution
                </Typography>
                {renderSimpleMarkdown(content.per_collaborator)}
              </Box>
            )}

            {siteEntries.length > 0 && (
              <Accordion sx={{ boxShadow: 'none', border: 1, borderColor: '#e3eaf5', borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Site label mapping ({siteEntries.length} sites)
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {siteEntries.map(({ label, realName }) => (
                      <ListItem key={label} disableGutters sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={
                            <Typography variant="body2">
                              <strong>{label}</strong> &nbsp;→&nbsp; {realName || 'Unknown participant'}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
              <ShieldIcon fontSize="small" />
              <Typography variant="caption">
                Generated from aggregated chi-square statistics only. No raw genotypes or sample IDs were used.
                {summary?.model && ` · Engine: ${summary.model}`}
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

const StatusChip = ({ status }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted':
        return { dot: alpha('#4caf50', 1.0), bg: alpha('#c8e6c9', 0.5) }; // Green
      case 'withdrawn':
        return { dot: alpha('#ff9800', 1.0), bg: alpha('#ffe0b2', 0.5) }; // Orange
      case 'rejected':
        return { dot: alpha('#f44336', 1.0), bg: alpha('#ffcdd2', 0.5) }; // Red
      default:
        return { dot: alpha('#1976d2', 1.0), bg: alpha('#bbdefb', 0.5) }; // Blue
    }
  };

  const { dot, bg } = getStatusColor(status);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: 10,
        padding: '4px 8px',
        marginLeft: 1,
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '100%',
          backgroundColor: dot,
          marginRight: 1,
        }}
      />
      <Typography variant="body2" color={dot}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Typography>
    </Box>
  );
};

export default CollaborationDetails;
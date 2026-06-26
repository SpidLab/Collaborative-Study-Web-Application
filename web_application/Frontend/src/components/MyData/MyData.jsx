import React, { useEffect, useState } from 'react';
import {
  Container, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Chip, Box, CircularProgress, Alert, Tooltip,
} from '@mui/material';
import axios from 'axios';
import URL from '../../config';

const MyData = () => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${URL}/api/my-datasets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDatasets(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.error('Failed to load datasets:', e);
        setError('Could not load your datasets. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h4" gutterBottom>My Data</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Datasets you have registered. Sample counts and markers are reported by your local
        Site Agent — your raw genotype files never leave your machine.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : datasets.length === 0 ? (
        <Alert severity="info">
          No datasets yet. Register a dataset, then start your Site Agent so it can report the
          sample count and markers here.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Phenotype</strong></TableCell>
                <TableCell align="right"><strong>Samples</strong></TableCell>
                <TableCell align="right"><strong>Markers</strong></TableCell>
                <TableCell><strong>Last synced</strong></TableCell>
                <TableCell><strong>File fingerprint</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>{d.phenotype || '—'}</TableCell>
                  <TableCell align="right">{d.number_of_samples != null ? d.number_of_samples : '—'}</TableCell>
                  <TableCell align="right">
                    {d.n_snps != null ? d.n_snps : <Chip size="small" label="not synced yet" />}
                  </TableCell>
                  <TableCell>{fmtDate(d.metadata_updated_at)}</TableCell>
                  <TableCell>
                    {d.file_sha256 ? (
                      <Tooltip title={d.file_sha256}>
                        <code>{String(d.file_sha256).slice(0, 12)}…</code>
                      </Tooltip>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};

export default MyData;

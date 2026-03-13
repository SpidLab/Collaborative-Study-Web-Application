"""
Orchestrator Client - Integration layer between Flask app.py and Kubernetes Orchestrator

This module replaces direct calls to QC Controller with calls to the orchestrator,
which manages QC containers dynamically.
"""
import requests
import logging
import time

logger = logging.getLogger(__name__)

class OrchestratorClient:
    """Client for communicating with the Kubernetes Orchestrator"""
    
    def __init__(self, orchestrator_url='http://localhost:3000'):
        self.orchestrator_url = orchestrator_url
        self.polling_interval = 2  # seconds
        self.max_wait_time = 180  # 3 minutes max wait
    
    def submit_qc_request(self, username, user_id, phenotype, method=None, action='initialize', params=None):
        """
        Submit a QC request to the orchestrator (ASYNC MODE)
        Returns immediately with request_id - use check_status() to poll for results
        
        Args:
            username: User's name
            user_id: User's ID
            phenotype: Phenotype name
            method: QC method (maf, hwe, missing, pca, privacy) - required for 'create' action
            action: 'initialize' or 'create'
            params: Additional parameters for QC method
            
        Returns:
            dict: {
                'success': True/False,
                'request_id': str (if successful),
                'status': 'processing'|'queued',
                'error': str (if failed)
            }
        """
        try:
            # Prepare request
            request_data = {
                'userId': user_id,
                'username': username,
                'phenotype': phenotype,
                'method': method,
                'action': action,
                'params': params or {}
            }
            
            logger.info(f"🚀 Submitting QC request to orchestrator (async): {username}, {action}, {phenotype}")
            
            # Submit to orchestrator
            response = requests.post(
                f"{self.orchestrator_url}/qc/process",
                json=request_data,
                timeout=10
            )
            
            if response.status_code != 200:
                logger.error(f"❌ Orchestrator error: {response.status_code} - {response.text}")
                return {
                    'success': False,
                    'error': f"Orchestrator error: {response.text}"
                }
            
            result = response.json()
            request_id = result.get('requestId')
            status = result.get('status')
            
            if not request_id:
                logger.error("❌ No request ID returned from orchestrator")
                return {
                    'success': False,
                    'error': 'No request ID from orchestrator'
                }
            
            logger.info(f"✅ Request submitted: {request_id}, status: {status}")
            
            return {
                'success': True,
                'request_id': request_id,
                'status': status,
                'pod_name': result.get('podName'),
                'position': result.get('position') if status == 'queued' else None
            }
        
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to connect to orchestrator: {str(e)}")
            return {
                'success': False,
                'error': f"Orchestrator connection failed: {str(e)}"
            }
        
        except Exception as e:
            logger.error(f"❌ Unexpected error in orchestrator client: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def check_status(self, request_id):
        """
        Check the status of a QC request
        
        Args:
            request_id: Request ID returned from submit_qc_request()
            
        Returns:
            dict: {
                'status': 'queued'|'processing'|'completed'|'failed',
                'results': dict (if completed),
                'error': str (if failed),
                'pod_name': str (if processing),
                'start_time': datetime (if processing)
            }
        """
        try:
            response = requests.get(
                f"{self.orchestrator_url}/qc/status/{request_id}",
                timeout=10
            )
            
            if response.status_code == 404:
                return {
                    'status': 'not_found',
                    'error': 'Request not found'
                }
            
            if response.status_code != 200:
                logger.error(f"❌ Status check error: {response.status_code} - {response.text}")
                return {
                    'status': 'error',
                    'error': f"Status check failed: {response.text}"
                }
            
            data = response.json()
            return {
                'status': data.get('status'),
                'results': data.get('results'),
                'error': data.get('error'),
                'pod_name': data.get('podName'),
                'start_time': data.get('startTime'),
                'completed_at': data.get('completedAt')
            }
        
        except Exception as e:
            logger.error(f"❌ Error checking status: {str(e)}")
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def get_results(self, request_id):
        """
        Get results for a completed request (legacy method - use check_status instead)
        
        Args:
            request_id: Request ID
            
        Returns:
            dict: Results or error
        """
        status = self.check_status(request_id)
        
        if status['status'] == 'completed':
            return {
                'success': True,
                'data': status.get('results', {})
            }
        elif status['status'] == 'failed':
            return {
                'success': False,
                'error': status.get('error', 'QC processing failed')
            }
        else:
            return {
                'success': False,
                'error': f"Request status: {status['status']}"
            }
    
    def submit_chained_qc_request(self, username, user_id, phenotype, collaboration_uuid, methods, dataset_id=None):
        """
        Submit a chained QC request (runs multiple QC methods sequentially).

        Args:
            username: User's name (DB identifier)
            user_id: User's ID
            phenotype: Phenotype name
            collaboration_uuid: Collaboration UUID
            methods: List of {method, params} objects in desired order

        Returns:
            dict with success, request_id, etc.
        """
        try:
            request_data = {
                'userId': user_id,
                'username': username,
                'phenotype': phenotype,
                'method': 'chained',
                'action': 'create_chained',
                'params': {
                    'methods': methods,
                    'collaboration_uuid': collaboration_uuid,
                    'dataset_id': dataset_id
                }
            }
            logger.info(f"Submitting chained QC: {username}, {phenotype}, {len(methods)} methods")

            response = requests.post(
                f"{self.orchestrator_url}/qc/process",
                json=request_data,
                timeout=10
            )

            if response.status_code != 200:
                logger.error(f"Orchestrator chained QC error: {response.status_code} - {response.text}")
                return {'success': False, 'error': f"Orchestrator error: {response.text}"}

            result = response.json()
            request_id = result.get('requestId')
            if not request_id:
                return {'success': False, 'error': 'No request ID from orchestrator'}

            return {
                'success': True,
                'request_id': request_id,
                'status': result.get('status')
            }
        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': str(e)}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def submit_gwas_summary_request(self, username, user_id, phenotype, collaboration_uuid, sample_ids, snp_ids=None):
        """
        Submit a GWAS summary dataset creation request to the orchestrator.

        Args:
            username: User's name (DB identifier)
            user_id: User's ID
            phenotype: Phenotype name
            collaboration_uuid: Collaboration UUID
            sample_ids: List of sample IDs from QC-filtered results

        Returns:
            dict: {'success': True, 'request_id': str, ...} or {'success': False, 'error': str}
        """
        try:
            request_data = {
                'userId': user_id,
                'username': username,
                'phenotype': phenotype,
                'collaborationUuid': collaboration_uuid,
                'sampleIds': sample_ids,
                'snpIds': snp_ids
            }
            logger.info(f"Submitting GWAS summary request: {username}, {phenotype}, {len(sample_ids)} samples, {len(snp_ids) if snp_ids else 'all'} SNPs")

            response = requests.post(
                f"{self.orchestrator_url}/gwas/process",
                json=request_data,
                timeout=10
            )

            if response.status_code != 200:
                logger.error(f"❌ Orchestrator GWAS error: {response.status_code} - {response.text}")
                return {'success': False, 'error': f"Orchestrator error: {response.text}"}

            result = response.json()
            request_id = result.get('requestId')
            if not request_id:
                return {'success': False, 'error': 'No request ID from orchestrator'}

            logger.info(f"✅ GWAS request submitted: {request_id}")
            return {
                'success': True,
                'request_id': request_id,
                'status': result.get('status')
            }

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to connect to orchestrator: {str(e)}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"❌ Unexpected error: {str(e)}")
            return {'success': False, 'error': str(e)}

    def get_orchestrator_status(self):
        """Get current orchestrator status"""
        try:
            response = requests.get(f"{self.orchestrator_url}/status", timeout=5)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Failed to get orchestrator status: {str(e)}")
            return None

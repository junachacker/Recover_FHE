import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface GuardianData {
  id: string;
  name: string;
  encryptedShare: string;
  publicKey: string;
  threshold: number;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [guardians, setGuardians] = useState<GuardianData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingGuardian, setCreatingGuardian] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newGuardianData, setNewGuardianData] = useState({ name: "", share: "", threshold: "" });
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianData | null>(null);
  const [decryptedShare, setDecryptedShare] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const guardiansList: GuardianData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          guardiansList.push({
            id: businessId,
            name: businessData.name,
            encryptedShare: businessId,
            publicKey: businessId,
            threshold: Number(businessData.publicValue1) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setGuardians(guardiansList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createGuardian = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingGuardian(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating guardian with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const shareValue = parseInt(newGuardianData.share) || 0;
      const businessId = `guardian-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, shareValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newGuardianData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newGuardianData.threshold) || 0,
        0,
        "Guardian Share"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Guardian created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewGuardianData({ name: "", share: "", threshold: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingGuardian(false); 
    }
  };

  const decryptShare = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Share decrypted and verified!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and working!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredGuardians = guardians.filter(guardian =>
    guardian.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guardian.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: guardians.length,
    verified: guardians.filter(g => g.isVerified).length,
    active: guardians.filter(g => Date.now()/1000 - g.timestamp < 60 * 60 * 24 * 30).length
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🧩 FHE Wallet Recovery</h1>
          </div>
          <ConnectButton />
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Wallet to Access Recovery System</h2>
            <p>Secure multi-party wallet recovery using FHE encryption</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading recovery data...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>🧩 FHE Wallet Recovery</h1>
          <p>Secure Multi-Party Recovery System</p>
        </div>
        
        <div className="header-actions">
          <button className="nav-btn" onClick={() => setShowFAQ(!showFAQ)}>
            {showFAQ ? "Close FAQ" : "View FAQ"}
          </button>
          <button className="test-btn" onClick={testAvailability}>
            Test Connection
          </button>
          <button className="create-btn" onClick={() => setShowCreateModal(true)}>
            + Add Guardian
          </button>
          <ConnectButton />
        </div>
      </header>

      {showFAQ && (
        <div className="faq-section">
          <h3>FHE Recovery FAQ</h3>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>How does FHE protect my shares?</h4>
              <p>Shares are encrypted using Fully Homomorphic Encryption, allowing computation without decryption.</p>
            </div>
            <div className="faq-item">
              <h4>What is the recovery threshold?</h4>
              <p>You set the minimum number of guardians required to recover your wallet.</p>
            </div>
            <div className="faq-item">
              <h4>Is my data secure?</h4>
              <p>All sensitive data remains encrypted throughout the recovery process.</p>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Guardians</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.verified}</div>
          <div className="stat-label">Verified Shares</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active Recovery</div>
        </div>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="Search guardians..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="guardians-list">
        {filteredGuardians.length === 0 ? (
          <div className="empty-state">
            <p>No guardians found</p>
            <button onClick={() => setShowCreateModal(true)} className="create-btn">
              Add First Guardian
            </button>
          </div>
        ) : (
          filteredGuardians.map((guardian, index) => (
            <div 
              key={index}
              className={`guardian-card ${guardian.isVerified ? 'verified' : ''}`}
              onClick={() => setSelectedGuardian(guardian)}
            >
              <div className="guardian-header">
                <h3>{guardian.name}</h3>
                <span className={`status ${guardian.isVerified ? 'verified' : 'pending'}`}>
                  {guardian.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                </span>
              </div>
              <div className="guardian-details">
                <div>Threshold: {guardian.threshold}</div>
                <div>Created: {new Date(guardian.timestamp * 1000).toLocaleDateString()}</div>
                <div>Creator: {guardian.creator.substring(0, 8)}...</div>
              </div>
              {guardian.isVerified && guardian.decryptedValue && (
                <div className="decrypted-value">
                  Share: {guardian.decryptedValue}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Add New Guardian</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Guardian Name</label>
                <input
                  type="text"
                  value={newGuardianData.name}
                  onChange={(e) => setNewGuardianData({...newGuardianData, name: e.target.value})}
                  placeholder="Enter guardian name"
                />
              </div>
              <div className="form-group">
                <label>Share Value (Integer)</label>
                <input
                  type="number"
                  value={newGuardianData.share}
                  onChange={(e) => setNewGuardianData({...newGuardianData, share: e.target.value})}
                  placeholder="Enter share value"
                />
              </div>
              <div className="form-group">
                <label>Recovery Threshold</label>
                <input
                  type="number"
                  value={newGuardianData.threshold}
                  onChange={(e) => setNewGuardianData({...newGuardianData, threshold: e.target.value})}
                  placeholder="Enter threshold"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createGuardian} 
                disabled={creatingGuardian || isEncrypting}
                className="submit-btn"
              >
                {creatingGuardian ? "Creating..." : "Create Guardian"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedGuardian && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Guardian Details</h2>
              <button onClick={() => setSelectedGuardian(null)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h3>{selectedGuardian.name}</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>Status:</span>
                    <span className={selectedGuardian.isVerified ? 'verified' : 'encrypted'}>
                      {selectedGuardian.isVerified ? 'Verified' : 'Encrypted'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span>Threshold:</span>
                    <span>{selectedGuardian.threshold}</span>
                  </div>
                  <div className="detail-item">
                    <span>Created:</span>
                    <span>{new Date(selectedGuardian.timestamp * 1000).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span>Creator:</span>
                    <span>{selectedGuardian.creator}</span>
                  </div>
                </div>
              </div>

              <div className="action-section">
                <button 
                  onClick={async () => {
                    const result = await decryptShare(selectedGuardian.id);
                    if (result !== null) setDecryptedShare(result);
                  }}
                  disabled={isDecrypting}
                  className={`decrypt-btn ${selectedGuardian.isVerified ? 'verified' : ''}`}
                >
                  {isDecrypting ? 'Decrypting...' : 
                   selectedGuardian.isVerified ? 'Share Verified' : 
                   'Decrypt Share'}
                </button>
                
                {(selectedGuardian.isVerified || decryptedShare !== null) && (
                  <div className="share-value">
                    Decrypted Share: {selectedGuardian.decryptedValue || decryptedShare}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
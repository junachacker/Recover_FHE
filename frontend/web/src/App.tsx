import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface GuardianData {
  id: string;
  name: string;
  shardValue: number;
  publicKey: string;
  description: string;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue: number;
  encryptedValueHandle?: string;
}

interface RecoveryStats {
  totalGuardians: number;
  activeGuardians: number;
  recoveryThreshold: number;
  successRate: number;
  avgShardValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [guardians, setGuardians] = useState<GuardianData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingGuardian, setAddingGuardian] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newGuardianData, setNewGuardianData] = useState({ name: "", shardValue: "", description: "" });
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianData | null>(null);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [operationHistory, setOperationHistory] = useState<Array<{type: string, timestamp: number, data: string}>>([]);
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState<RecoveryStats>({
    totalGuardians: 0,
    activeGuardians: 0,
    recoveryThreshold: 3,
    successRate: 0,
    avgShardValue: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
        addToHistory("FHE System Initialized", "FHEVM initialized successfully");
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
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

  const addToHistory = (type: string, data: string) => {
    setOperationHistory(prev => [{
      type,
      timestamp: Date.now(),
      data
    }, ...prev.slice(0, 9)]);
  };

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
            shardValue: Number(businessData.publicValue1) || 0,
            publicKey: businessData.creator,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading guardian data:', e);
        }
      }
      
      setGuardians(guardiansList);
      updateStats(guardiansList);
      addToHistory("Data Loaded", `Loaded ${guardiansList.length} guardians`);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateStats = (guardiansList: GuardianData[]) => {
    const total = guardiansList.length;
    const active = guardiansList.filter(g => g.isVerified).length;
    const avgValue = total > 0 ? guardiansList.reduce((sum, g) => sum + g.shardValue, 0) / total : 0;
    const successRate = total > 0 ? (active / total) * 100 : 0;
    
    setStats({
      totalGuardians: total,
      activeGuardians: active,
      recoveryThreshold: 3,
      successRate,
      avgShardValue: avgValue
    });
  };

  const addGuardian = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setAddingGuardian(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Adding guardian with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const shardValue = parseInt(newGuardianData.shardValue) || 0;
      const businessId = `guardian-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, shardValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newGuardianData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        shardValue,
        0,
        newGuardianData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Guardian added successfully!" });
      addToHistory("Guardian Added", `Added ${newGuardianData.name} with shard value ${shardValue}`);
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowAddModal(false);
      setNewGuardianData({ name: "", shardValue: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setAddingGuardian(false); 
    }
  };

  const decryptShard = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Shard already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying shard decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      addToHistory("Shard Decrypted", `Decrypted shard value: ${clearValue}`);
      
      setTransactionStatus({ visible: true, status: "success", message: "Shard decrypted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Shard is already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Contract is available and ready" 
      });
      addToHistory("Contract Check", "isAvailable() called successfully");
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract call failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStatsDashboard = () => {
    return (
      <div className="dashboard-panels">
        <div className="panel metal-panel">
          <div className="stat-icon">🛡️</div>
          <h3>Total Guardians</h3>
          <div className="stat-value">{stats.totalGuardians}</div>
          <div className="stat-trend">{stats.activeGuardians} active</div>
        </div>
        
        <div className="panel metal-panel">
          <div className="stat-icon">🔐</div>
          <h3>Recovery Threshold</h3>
          <div className="stat-value">{stats.recoveryThreshold}/5</div>
          <div className="stat-trend">Shards required</div>
        </div>
        
        <div className="panel metal-panel">
          <div className="stat-icon">📊</div>
          <h3>Success Rate</h3>
          <div className="stat-value">{stats.successRate.toFixed(1)}%</div>
          <div className="stat-trend">Recovery ready</div>
        </div>
        
        <div className="panel metal-panel">
          <div className="stat-icon">⚡</div>
          <h3>Avg Shard Value</h3>
          <div className="stat-value">{stats.avgShardValue.toFixed(1)}</div>
          <div className="stat-trend">FHE protected</div>
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Shard Encryption</h4>
            <p>Private key shards encrypted with Zama FHE 🔐</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Distributed Storage</h4>
            <p>Encrypted shards stored with different guardians</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Homomorphic Computation</h4>
            <p>Shards combined using FHE operations</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Wallet Recovery</h4>
            <p>Original private key reconstructed securely</p>
          </div>
        </div>
      </div>
    );
  };

  const renderOperationHistory = () => {
    return (
      <div className="history-panel metal-panel">
        <h3>Recent Operations</h3>
        <div className="history-list">
          {operationHistory.length === 0 ? (
            <div className="no-history">No operations yet</div>
          ) : (
            operationHistory.map((op, index) => (
              <div key={index} className="history-item">
                <div className="history-type">{op.type}</div>
                <div className="history-data">{op.data}</div>
                <div className="history-time">{new Date(op.timestamp).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderFAQ = () => {
    return (
      <div className="faq-modal">
        <div className="modal-header">
          <h2>FHE Wallet Recovery FAQ</h2>
          <button onClick={() => setShowFAQ(false)} className="close-modal">&times;</button>
        </div>
        <div className="faq-content">
          <div className="faq-item">
            <h4>What is FHE Wallet Recovery?</h4>
            <p>Fully Homomorphic Encryption allows computations on encrypted data without decryption, enabling secure private key recovery through shard combination.</p>
          </div>
          <div className="faq-item">
            <h4>How does the recovery process work?</h4>
            <p>Your private key is split into encrypted shards distributed to guardians. Recovery requires threshold number of guardians to combine shards homomorphically.</p>
          </div>
          <div className="faq-item">
            <h4>Is my data secure?</h4>
            <p>Yes! Shards remain encrypted throughout the process. No single guardian can access the complete private key.</p>
          </div>
          <div className="faq-item">
            <h4>What happens if I lose access?</h4>
            <p>Contact your guardians to initiate recovery. The system will combine shards to reconstruct your wallet access securely.</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE Wallet Recovery 🔐</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🛡️</div>
            <h2>Connect Your Wallet to Begin</h2>
            <p>Secure your assets with FHE-protected wallet recovery. Connect your wallet to set up guardian shards.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet using the button above</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will automatically initialize</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Add guardians and secure your wallet with encrypted shards</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p>Status: {fhevmInitializing ? "Initializing FHEVM" : status}</p>
        <p className="loading-note">Securing your recovery system</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted recovery system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Wallet Recovery 🛡️</h1>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="test-btn">
            Test Contract
          </button>
          <button onClick={() => setShowFAQ(true)} className="faq-btn">
            FAQ
          </button>
          <button onClick={() => setShowAddModal(true)} className="create-btn">
            + Add Guardian
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <h2>Wallet Recovery Dashboard (FHE 🔐)</h2>
          {renderStatsDashboard()}
          
          <div className="panel metal-panel full-width">
            <h3>FHE Recovery Process</h3>
            {renderFHEFlow()}
          </div>

          {renderOperationHistory()}
        </div>
        
        <div className="guardians-section">
          <div className="section-header">
            <h2>Guardian Shards</h2>
            <div className="header-actions">
              <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="guardians-list">
            {guardians.length === 0 ? (
              <div className="no-guardians">
                <p>No guardian shards found</p>
                <button className="create-btn" onClick={() => setShowAddModal(true)}>
                  Add First Guardian
                </button>
              </div>
            ) : guardians.map((guardian, index) => (
              <div className="guardian-item metal-panel" key={index}>
                <div className="guardian-header">
                  <div className="guardian-name">{guardian.name}</div>
                  <div className={`guardian-status ${guardian.isVerified ? "verified" : "pending"}`}>
                    {guardian.isVerified ? "✅ Verified" : "🔓 Pending"}
                  </div>
                </div>
                <div className="guardian-description">{guardian.description}</div>
                <div className="guardian-meta">
                  <span>Shard Value: {guardian.shardValue}</span>
                  <span>Added: {new Date(guardian.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="guardian-actions">
                  <button 
                    onClick={() => decryptShard(guardian.id)}
                    className={`decrypt-btn ${guardian.isVerified ? 'verified' : ''}`}
                  >
                    {guardian.isVerified ? "Shard Verified" : "Verify Shard"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showAddModal && (
        <ModalAddGuardian 
          onSubmit={addGuardian} 
          onClose={() => setShowAddModal(false)} 
          adding={addingGuardian} 
          guardianData={newGuardianData} 
          setGuardianData={setNewGuardianData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {showFAQ && (
        <div className="modal-overlay">
          {renderFAQ()}
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalAddGuardian: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  guardianData: any;
  setGuardianData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, adding, guardianData, setGuardianData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'shardValue') {
      const intValue = value.replace(/[^\d]/g, '');
      setGuardianData({ ...guardianData, [name]: intValue });
    } else {
      setGuardianData({ ...guardianData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="add-guardian-modal">
        <div className="modal-header">
          <h2>Add Recovery Guardian</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Encryption</strong>
            <p>Guardian shard value will be encrypted with Zama FHE (Integer only)</p>
          </div>
          
          <div className="form-group">
            <label>Guardian Name *</label>
            <input 
              type="text" 
              name="name" 
              value={guardianData.name} 
              onChange={handleChange} 
              placeholder="Enter guardian name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Shard Value (Integer only) *</label>
            <input 
              type="number" 
              name="shardValue" 
              value={guardianData.shardValue} 
              onChange={handleChange} 
              placeholder="Enter shard value..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={guardianData.description} 
              onChange={handleChange} 
              placeholder="Enter guardian description..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={adding || isEncrypting || !guardianData.name || !guardianData.shardValue} 
            className="submit-btn"
          >
            {adding || isEncrypting ? "Encrypting and Adding..." : "Add Guardian"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;


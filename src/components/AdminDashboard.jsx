import React, { useState } from 'react';
import { 
  BarChart3, Database, Sliders, AlertCircle, Users, UserPlus, Upload, Search, Edit3, Trash2, CheckCircle2, Shield
} from 'lucide-react';

export default function AdminDashboard({ 
  beneficiaries, parameters, issueTypes, users,
  onAddBeneficiary, onUpdateParameter, onAddIssue, onAddUser 
}) {
  const [activeTab, setActiveTab] = useState('analytics'); // analytics | master | params | issues | users

  // Stats calculation
  const totalBeneficiaries = beneficiaries.length;
  const totalAssigned = beneficiaries.filter(b => b.assignedSurveyorId).length;
  const surveyCompleted = beneficiaries.filter(b => b.status === 'Completed').length;
  const surveyPending = beneficiaries.filter(b => b.status === 'Pending').length;
  const verifiedCount = beneficiaries.filter(b => b.overallResult === 'VERIFIED').length;
  const issueFoundCount = beneficiaries.filter(b => b.status === 'Issue Found' || b.overallResult === 'ISSUE FOUND').length;
  const returnedCount = 0;

  // New beneficiary state
  const [newBen, setNewBen] = useState({
    id: `AYU-BEN-${Math.floor(100000 + Math.random() * 900000)}`,
    name: '', fatherName: '', age: '', gender: 'Male', mobile: '', address: '', district: 'Lucknow', block: 'Chinhat', gp: 'Mati', village: 'Mati Gaon', assignedSurveyorId: 'SURV-101'
  });
  const [showAddBenModal, setShowAddBenModal] = useState(false);

  const handleCreateBen = (e) => {
    e.preventDefault();
    const assignedUser = users.find(u => u.id === newBen.assignedSurveyorId);
    onAddBeneficiary({
      ...newBen,
      status: 'Pending',
      assignedSurveyorName: assignedUser ? assignedUser.name : 'Amit Singh'
    });
    setShowAddBenModal(false);
    setNewBen({
      id: `AYU-BEN-${Math.floor(100000 + Math.random() * 900000)}`,
      name: '', fatherName: '', age: '', gender: 'Male', mobile: '', address: '', district: 'Lucknow', block: 'Chinhat', gp: 'Mati', village: 'Mati Gaon', assignedSurveyorId: 'SURV-101'
    });
  };

  return (
    <div>
      {/* Top Header & Admin Navigation Tabs */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--neutral-900)' }}>
            State Administrative Portal (प्रशासनिक डैशबोर्ड)
          </h1>
          <p style={{ color: 'var(--neutral-600)', fontSize: '0.9rem' }}>
            System Administration, Parameter Configuration, Masters, and Overall Survey Progress.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '0.35rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--neutral-200)' }}>
          {[
            { id: 'analytics', label: 'Dashboard & Progress' },
            { id: 'master', label: 'Beneficiary Master' },
            { id: 'params', label: '3-Parameter Master' },
            { id: 'issues', label: 'Issue Master' },
            { id: 'users', label: 'User Management' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
              style={{ border: 'none', padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: ANALYTICS & PROGRESS */}
      {activeTab === 'analytics' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Total Beneficiaries</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{totalBeneficiaries}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Total Assigned</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary)' }}>{totalAssigned}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Survey Completed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--success)' }}>{surveyCompleted}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Survey Pending</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--warning)' }}>{surveyPending}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Verified</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--success)' }}>{verifiedCount}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Issue Found</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--danger)' }}>{issueFoundCount}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Issue Found</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--danger)' }}>{issueFoundCount}</div>
            </div>
          </div>

          {/* Visual Progress Breakdown Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>District-Wise Verification Progress</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span>Lucknow District (80% Completed)</span>
                    <strong>4/5 Verified</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--neutral-200)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: '80%', height: '100%', background: 'var(--primary)' }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span>Barabanki District (65% Completed)</span>
                    <strong>13/20 Verified</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--neutral-200)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: '65%', height: '100%', background: 'var(--success)' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Surveyor Performance Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.5rem' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>Amit Singh (Chinhat Block)</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>4 Assigned | 3 Completed</span>
                  </div>
                  <span className="badge badge-success">75% Completion</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>Priya Sharma (Sarojini Nagar)</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>1 Assigned | 0 Completed</span>
                  </div>
                  <span className="badge badge-warning">0% Completion</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BENEFICIARY MASTER */}
      {activeTab === 'master' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>Beneficiary Master Directory</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
                <Upload size={14} /> Upload Excel / CSV
              </button>
              <button className="btn btn-primary" style={{ fontSize: '0.85rem' }} onClick={() => setShowAddBenModal(true)}>
                <UserPlus size={14} /> Add New Beneficiary
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Beneficiary ID</th>
                  <th>Name</th>
                  <th>District</th>
                  <th>Block</th>
                  <th>GP</th>
                  <th>Village</th>
                  <th>Assigned Surveyor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {beneficiaries.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{b.id}</td>
                    <td style={{ fontWeight: '600' }}>{b.name}</td>
                    <td>{b.district}</td>
                    <td>{b.block}</td>
                    <td>{b.gp}</td>
                    <td>{b.village}</td>
                    <td style={{ fontWeight: '600', color: 'var(--neutral-700)' }}>{b.assignedSurveyorName || 'Unassigned'}</td>
                    <td>
                      <span className={`badge ${b.status === 'Completed' ? 'badge-success' : b.status === 'Pending' ? 'badge-warning' : 'badge-danger'}`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Beneficiary Modal */}
          {showAddBenModal && (
            <div style={{ background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: 'var(--radius-lg)', maxWidth: '500px', width: '100%' }}>
                <h3 style={{ marginBottom: '1rem' }}>Add New Pre-selected Beneficiary</h3>
                <form onSubmit={handleCreateBen}>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-control" required value={newBen.name} onChange={e => setNewBen({...newBen, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Father / Husband Name *</label>
                    <input className="form-control" required value={newBen.fatherName} onChange={e => setNewBen({...newBen, fatherName: e.target.value})} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div className="form-group">
                      <label className="form-label">Age</label>
                      <input className="form-control" type="number" required value={newBen.age} onChange={e => setNewBen({...newBen, age: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mobile</label>
                      <input className="form-control" required value={newBen.mobile} onChange={e => setNewBen({...newBen, mobile: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assign to Field Surveyor</label>
                    <select className="form-select" value={newBen.assignedSurveyorId} onChange={e => setNewBen({...newBen, assignedSurveyorId: e.target.value})}>
                      {users.filter(u => u.role === 'Surveyor').map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.id})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setShowAddBenModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save & Assign</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 3-PARAMETER MASTER */}
      {activeTab === 'params' && (
        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>3-Parameter Configuration Master</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>
              Configure the 3 parameters without modifying any frontend code.
            </p>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Parameter ID</th>
                  <th>Parameter Name & Rule</th>
                  <th>Description</th>
                  <th>Required</th>
                  <th>Photo Required</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{p.id}</td>
                    <td style={{ fontWeight: '600' }}>{p.name}</td>
                    <td>{p.description}</td>
                    <td><span className="badge badge-success">Yes</span></td>
                    <td>{p.photoRequired ? <span className="badge badge-warning">Required</span> : <span className="badge badge-neutral">Optional</span>}</td>
                    <td><span className="badge badge-success">Active</span></td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                        <Edit3 size={14} /> Edit Config
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ISSUE MASTER */}
      {activeTab === 'issues' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>Issue Type Master</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>
                Issue options dynamically loaded into surveyor conditional dropdowns.
              </p>
            </div>
            <button className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              + Add Issue Type
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Issue ID</th>
                  <th>Mapped Parameter</th>
                  <th>Issue Name</th>
                  <th>Proof Document Required?</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {issueTypes.map((iss) => (
                  <tr key={iss.id}>
                    <td style={{ fontWeight: '700' }}>{iss.id}</td>
                    <td><span className="badge badge-neutral">{iss.parameterId}</span></td>
                    <td style={{ fontWeight: '600' }}>{iss.name}</td>
                    <td>{iss.proofRequired ? <span className="badge badge-danger">Mandatory</span> : <span className="badge badge-neutral">No</span>}</td>
                    <td><span className="badge badge-success">Active</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>User & Role Management</h2>
            <button className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              + Register New User
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Role</th>
                  <th>Assigned District</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{u.id}</td>
                    <td style={{ fontWeight: '600' }}>{u.name}</td>
                    <td>{u.mobile}</td>
                    <td>
                      <span className={`badge ${u.role === 'Admin' ? 'badge-danger' : u.role === 'Supervisor' ? 'badge-warning' : 'badge-neutral'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.district}</td>
                    <td><span className="badge badge-success">{u.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

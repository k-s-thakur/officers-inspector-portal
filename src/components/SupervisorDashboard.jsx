import React, { useState } from 'react';
import { 
  CheckCircle, AlertTriangle, Eye, ArrowLeft, Send, RotateCcw, Filter, Check 
} from 'lucide-react';

export default function SupervisorDashboard({ beneficiaries, onUpdateStatus }) {
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [correctionRemark, setCorrectionRemark] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // Submitted surveys
  const submittedSurveys = beneficiaries.filter(b => b.status === 'Completed' || b.status === 'Issue Found');

  const filteredSurveys = submittedSurveys.filter(b => !statusFilter || b.status === statusFilter);

  // Dynamic Metrics
  const totalSubmitted = submittedSurveys.length;
  const verifiedCount = submittedSurveys.filter(b => b.status === 'Completed' && b.overallResult === 'VERIFIED').length;
  const issueCount = submittedSurveys.filter(b => b.status === 'Issue Found').length;
  const returnedCount = 0;

  const handleVerify = (bId) => {
    onUpdateStatus(bId, 'Completed', 'VERIFIED');
    setSelectedSurvey(null);
  };

  const handleReturnConfirm = () => {
    if (!correctionRemark.trim()) return;
    onUpdateStatus(selectedSurvey.id, 'Returned', selectedSurvey.overallResult, correctionRemark);
    setShowReturnModal(false);
    setSelectedSurvey(null);
    setCorrectionRemark('');
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--neutral-900)' }}>
          Supervisor Verification Portal (पर्यवेक्षक डैशबोर्ड)
        </h1>
        <p style={{ color: 'var(--neutral-600)', fontSize: '0.9rem' }}>
          Review submitted 3-parameter surveys and issue decisions (Verify or Return for Correction).
        </p>
      </div>

      {/* Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Total Submitted</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary)' }}>{totalSubmitted}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Verified</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--success)' }}>{verifiedCount}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Issue Found</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--danger)' }}>{issueCount}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--neutral-500)', fontWeight: '600' }}>Returned for Correction</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--warning)' }}>{returnedCount}</div>
        </div>
      </div>

      {/* Detail Review Mode */}
      {selectedSurvey ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.75rem' }}>
            <button className="btn btn-outline" onClick={() => setSelectedSurvey(null)}>
              <ArrowLeft size={18} /> Back to Submitted List
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--neutral-500)' }}>
              Survey ID: <strong>{selectedSurvey.surveyId || 'AYU-SRV-2026-991'}</strong>
            </span>
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>
            Survey Review: {selectedSurvey.name} ({selectedSurvey.id})
          </h2>

          {/* Read-Only Beneficiary Details */}
          <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--neutral-200)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>
              Beneficiary Master Details (Read-only)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div><strong>Father/Husband:</strong> {selectedSurvey.fatherName}</div>
              <div><strong>Age / Gender:</strong> {selectedSurvey.age} Yrs / {selectedSurvey.gender}</div>
              <div><strong>Mobile:</strong> {selectedSurvey.mobile}</div>
              <div><strong>Address:</strong> {selectedSurvey.address}</div>
              <div><strong>Village / GP:</strong> {selectedSurvey.village} / {selectedSurvey.gp}</div>
              <div><strong>Surveyor:</strong> {selectedSurvey.assignedSurveyorName}</div>
            </div>
          </div>

          {/* Submitted 3-Parameters Breakdown */}
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.75rem' }}>
            Parameter Verification Results
          </h3>
          <div className="table-container" style={{ marginBottom: '1.5rem' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Status Selected</th>
                  <th>Issue Details & Remarks</th>
                  <th>Attached Proof</th>
                </tr>
              </thead>
              <tbody>
                {['P1', 'P2', 'P3'].map((pKey, idx) => {
                  const paramNames = [
                    'P1: Identity & Family Headcount',
                    'P2: Aadhaar & Document Match',
                    'P3: Ayushman Card Physical Availability'
                  ];
                  const resp = selectedSurvey.parameterResponses?.[pKey] || { status: 'सही' };
                  return (
                    <tr key={pKey}>
                      <td style={{ fontWeight: '600' }}>{paramNames[idx]}</td>
                      <td>
                        {resp.status === 'सही' ? (
                          <span className="badge badge-success">🟢 सही</span>
                        ) : (
                          <span className="badge badge-danger">🔴 Issue</span>
                        )}
                      </td>
                      <td>
                        {resp.status === 'Issue' ? (
                          <div>
                            <strong style={{ color: 'var(--danger)' }}>{resp.issueType}</strong>
                            <div style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>{resp.remark}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--neutral-400)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {resp.proofName ? (
                          <span style={{ color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>{resp.proofName}</span>
                        ) : (
                          <span style={{ color: 'var(--neutral-400)' }}>None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Supervisor Decision Buttons */}
          <div style={{ background: 'var(--neutral-100)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--neutral-300)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.75rem', color: 'var(--neutral-800)' }}>
              Supervisor Action Decision
            </h3>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-success"
                onClick={() => handleVerify(selectedSurvey.id)}
              >
                🟢 Verify Survey (सत्यापित करें)
              </button>

              <button
                className="btn btn-danger"
                onClick={() => setShowReturnModal(true)}
                style={{ display: 'none' }}
              >
                🟠 Return for Correction (संशोधन हेतु वापस करें)
              </button>
            </div>
          </div>

          {/* Return Modal / Textarea */}
          {showReturnModal && (
            <div style={{ marginTop: '1.25rem', padding: '1.25rem', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--warning)', marginBottom: '0.5rem' }}>
                Enter Correction Reason (संशोधन टिप्पणी) *
              </h4>
              <textarea
                className="form-control"
                rows="3"
                placeholder="Explain why this survey is being returned to the surveyor for re-investigation..."
                value={correctionRemark}
                onChange={(e) => setCorrectionRemark(e.target.value)}
              />
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setShowReturnModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleReturnConfirm}>Confirm Return & Send Notification</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Submitted Table View */
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>Submitted Surveys Queue</h2>
            <select className="form-select" style={{ width: '200px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Issue Found">Issue Found</option>
            </select>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Survey ID</th>
                  <th>Beneficiary Name</th>
                  <th>Surveyor Name</th>
                  <th>Village</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSurveys.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{b.surveyId || 'AYU-SRV-2026-001'}</td>
                    <td style={{ fontWeight: '600' }}>{b.name}</td>
                    <td>{b.assignedSurveyorName}</td>
                    <td>{b.village}</td>
                    <td>
                      {b.status === 'Completed' && <span className="badge badge-success">🟢 Completed</span>}
                      {b.status === 'Issue Found' && <span className="badge badge-danger">🔴 Issue Found</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        onClick={() => setSelectedSurvey(b)}
                      >
                        <Eye size={14} /> Review Survey
                      </button>
                    </td>
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

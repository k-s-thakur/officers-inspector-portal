import React, { useState } from 'react';
import { 
  CheckCircle, AlertTriangle, ArrowLeft, Check
} from 'lucide-react';
import { appConfig } from '../config';

const aadhaarRemarkOptions = [
  'जन्म प्रमाण पत्र नहीं बनाया गया',
  'जन्म प्रमाण पत्र ऑफलाइन',
  'माता-पिता का नाम आधार मे और बच्चे के जन्म प्रमाण पत्र में नाम मेल नहीं खा रहे थे',
  'एनरोलमेंट करवाया गया है, परंतु आधार कार्ड नहीं मिला है',
  'एनरोलमेंट करवाया गया है, परंतु रिजेक्ट हो गया है',
  'माता-पिता के पास आधार कार्ड नहीं है',
  'मृत्यु',
  'बच्चा अनाथ है',
  'व्यक्ति नहीं मिला',
  'पलायन',
  'ऑनलाइन सही जन्म प्रमाण पत्र उपलब्ध है, परंतु एनरोलमेंट नहीं हुआ है।',
  'नया वोटर आईडी कार्ड उपलब्ध नहीं है',
  'नया वोटर आईडी कार्ड उपलब्ध है परंतु एनरोलमेंट नहीं हुआ है।'
];

export default function SurveyWizard({ beneficiary, parameters, issueTypes, onSubmitSurvey, onCancel }) {
  const [step, setStep] = useState(1);
  const [localSurveyId] = useState(() => `${appConfig.surveyIdPrefix}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`);
  const [submittedSurvey, setSubmittedSurvey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Parameter state: { p1: { status: '', issueType: '', remark: '', proofName: '' }, ... }
  const [responses, setResponses] = useState(
    beneficiary.parameterResponses || {
      P1: { status: '', issueType: '', remark: '', proofName: '' },
      P2: { status: '', issueType: '', remark: '', proofName: '' },
      P3: { status: '', issueType: '', remark: '', proofName: '' }
    }
  );

  const [aadhaarInfo, setAadhaarInfo] = useState(
    beneficiary.aadhaarInfo || {
      type: '',
      aadhaarNumber: '',
      enrollmentNumber: '',
      remark: ''
    }
  );

  const [rationInfo, setRationInfo] = useState(
    beneficiary.rationInfo || {
      hasRationCard: '',
      rationNumber: ''
    }
  );

  const [mobileInfo, setMobileInfo] = useState(
    beneficiary.mobileInfo || {
      mobileNumber: ''
    }
  );

  const [validationError, setValidationError] = useState('');

  const handleStatusChange = (paramId, newStatus) => {
    setResponses(prev => ({
      ...prev,
      [paramId]: {
        ...prev[paramId],
        status: newStatus,
        // Reset issue fields if changed to सही
        ...(newStatus === 'सही' ? { issueType: '', remark: '', proofName: '' } : {})
      }
    }));
    setValidationError('');
  };

  const handleFieldChange = (paramId, field, value) => {
    setResponses(prev => ({
      ...prev,
      [paramId]: {
        ...prev[paramId],
        [field]: value
      }
    }));
    setValidationError('');
  };

  const updateAadhaarInfo = (field, value) => {
    setAadhaarInfo(prev => ({
      ...prev,
      [field]: value
    }));
    setValidationError('');
  };

  const updateRationInfo = (field, value) => {
    setRationInfo(prev => {
      const next = {
        ...prev,
        [field]: value
      };

      if (field === 'hasRationCard' && value === 'no') {
        next.rationNumber = '';
      }

      return next;
    });
    setValidationError('');
  };

  const handleAadhaarTypeChange = (type) => {
    setAadhaarInfo(prev => ({
      ...prev,
      type
    }));
    setValidationError('');
  };

  const updateMobileInfo = (value) => {
    const normalized = value.replace(/\D/g, '').slice(0, 10);
    setMobileInfo({ mobileNumber: normalized });
    setValidationError('');
  };

  const validateAadhaarInfo = () => {
    if (!aadhaarInfo.type) {
      setValidationError('कृपया पहले आधार कार्ड, एनरोलमेंट नंबर या रिमार्क में से एक विकल्प चुनें।');
      return false;
    }

    if (aadhaarInfo.type === 'aadhaar' && aadhaarInfo.aadhaarNumber.replace(/\D/g, '').length !== 12) {
      setValidationError('कृपया 12 अंकों का आधार कार्ड नंबर दर्ज करें।');
      return false;
    }

    if (aadhaarInfo.type === 'enrollment' && aadhaarInfo.enrollmentNumber.replace(/\D/g, '').length !== 28) {
      setValidationError('कृपया 28 अंकों का एनरोलमेंट नंबर दर्ज करें।');
      return false;
    }

    if (aadhaarInfo.type === 'remark' && !aadhaarInfo.remark) {
      setValidationError('कृपया रिमार्क का एक विकल्प चुनें।');
      return false;
    }

    return true;
  };

  const validateRationInfo = () => {
    if (!rationInfo.hasRationCard) {
      setValidationError('कृपया राशन कार्ड उपलब्धता चुनें।');
      return false;
    }

    if (rationInfo.hasRationCard === 'yes') {
      const normalized = rationInfo.rationNumber.replace(/\D/g, '');
      if (!normalized) {
        setValidationError('कृपया 12 अंकों का राशन कार्ड नंबर दर्ज करें।');
        return false;
      }

      if (normalized.length !== 12) {
        setValidationError('राशन कार्ड नंबर 12 अंकों का होना चाहिए।');
        return false;
      }
    }

    return true;
  };

  const validateStep2 = () => {
    if (!validateAadhaarInfo()) {
      return false;
    }

    setValidationError('');
    return true;
  };

  const validateStep3 = () => {
    if (!validateRationInfo()) {
      return false;
    }

    setValidationError('');
    return true;
  };

  const validateMobileInfo = () => {
    const normalized = mobileInfo.mobileNumber.replace(/\D/g, '');

    if (!normalized) {
      setValidationError('कृपया 10 अंकों का मोबाइल नंबर दर्ज करें या 0000000000 डालें।');
      return false;
    }

    if (normalized.length !== 10) {
      setValidationError('मोबाइल नंबर 10 अंकों का होना चाहिए।');
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (validateStep2()) {
        setStep(3);
      }
    } else if (step === 3) {
      if (validateStep3()) {
        setStep(4);
      }
    } else if (step === 4) {
      if (validateMobileInfo()) {
        setStep(5);
      }
    }
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;

    const overallResult = 'VERIFIED';

    setIsSubmitting(true);
    setValidationError('');

    try {
      const result = await onSubmitSurvey({
        beneficiaryId: beneficiary.id,
        responses,
        aadhaarInfo,
        rationInfo,
        mobileInfo,
        overallResult
      });
      setSubmittedSurvey(result || null);
      setStep(6);
    } catch (error) {
      console.error('Survey submit failed:', error);
      setValidationError('Survey submit नहीं हो सका। कृपया backend/API connection check करें।');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compute stats for review
  const hasIssue = false;
  const overallResultText = 'VERIFIED';
  const isAadhaarReady =
    (aadhaarInfo.type === 'aadhaar' && aadhaarInfo.aadhaarNumber.length === 12) ||
    (aadhaarInfo.type === 'enrollment' && aadhaarInfo.enrollmentNumber.length === 28) ||
    (aadhaarInfo.type === 'remark' && Boolean(aadhaarInfo.remark));
  const isRationReady = rationInfo.hasRationCard === 'no' ||
    (rationInfo.hasRationCard === 'yes' && rationInfo.rationNumber.replace(/\D/g, '').length === 12);
  const isMobileReady = mobileInfo.mobileNumber.replace(/\D/g, '').length === 10;

  return (
    <div className="survey-wizard-shell" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <button className="btn btn-outline" onClick={onCancel}>
          <ArrowLeft size={18} /> Back to Assigned
        </button>
        <span style={{ fontSize: '0.875rem', color: 'var(--neutral-500)' }}>
          Beneficiary: <strong>{beneficiary.name}</strong> ({beneficiary.id})
        </span>
      </div>

      {/* Progress Indicator */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {[
            { num: 1, label: '1. Details' },
            { num: 2, label: '2. Aadhaar Verification' },
            { num: 3, label: '3. Ration' },
            { num: 4, label: '4. Mobile' },
            { num: 5, label: '5. Review' },
            { num: 6, label: '6. Submit' }
          ].map((item, idx) => (
            <div key={item.num} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: step >= item.num ? 1 : 0.4 }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: step === item.num ? 'var(--primary)' : step > item.num ? 'var(--success)' : 'var(--neutral-300)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.85rem'
              }}>
                {step > item.num ? <Check size={16} /> : item.num}
              </div>
              <span style={{ fontWeight: step === item.num ? '700' : '500', fontSize: '0.875rem' }}>
                {item.label}
              </span>
              {idx < 3 && <div style={{ width: '20px', height: '2px', background: 'var(--neutral-200)', margin: '0 0.25rem' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: BENEFICIARY DETAILS */}
      {step === 1 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--neutral-200)' }}>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--neutral-800)' }}>Beneficiary Information</h3>
            <span className="badge badge-warning">Survey Status: Pending</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div>
              <span className="form-label">Beneficiary ID</span>
              <div style={{ fontWeight: '600', color: 'var(--primary)' }}>{beneficiary.id}</div>
            </div>
            <div>
              <span className="form-label">Name (नाम)</span>
              <div style={{ fontWeight: '600' }}>{beneficiary.name}</div>
            </div>
            <div>
              <span className="form-label">Father / Husband Name</span>
              <div>{beneficiary.fatherName}</div>
            </div>
            <div>
              <span className="form-label">Age / Gender</span>
              <div>{beneficiary.age} Yrs / {beneficiary.gender}</div>
            </div>
            <div>
              <span className="form-label">Mobile Number</span>
              <div style={{ fontWeight: '600' }}>{beneficiary.mobile}</div>
            </div>
            <div>
              <span className="form-label">Address</span>
              <div>{beneficiary.address}</div>
            </div>
            <div>
              <span className="form-label">District</span>
              <div>{beneficiary.district}</div>
            </div>
            <div>
              <span className="form-label">Block / Gram Panchayat</span>
              <div>{beneficiary.block} / {beneficiary.gp}</div>
            </div>
            <div>
              <span className="form-label">Village</span>
              <div style={{ fontWeight: '600' }}>{beneficiary.village}</div>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
            <button className="btn btn-primary" onClick={handleNext}>
              सत्यापन शुरू करें &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: THREE-PARAMETER VERIFICATION UI */}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--neutral-800)' }}>
              Aadhaar Verification (आधार सत्यापन)
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--neutral-600)' }}>
              Only Aadhaar primary verification is required before review and submission.
            </p>
          </div>

          {validationError && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
              <AlertTriangle size={20} />
              <span>{validationError}</span>
            </div>
          )}

          <div className="card" style={{ padding: '1.5rem', borderRadius: '18px', border: '1px solid var(--neutral-200)', background: '#fff', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--neutral-200)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 0.3rem 0', color: 'var(--neutral-900)' }}>आधार जानकारी भरें</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--neutral-600)' }}>
                  {beneficiary.name} - मुखिया: {beneficiary.fatherName} / पिता/पति का नाम: {beneficiary.fatherName} - {beneficiary.village}, {beneficiary.block}
                </p>
              </div>
              <button type="button" className="aadhaar-close-btn" onClick={onCancel} aria-label="बंद करें" style={{ marginLeft: 'auto' }}>
                &times;
              </button>
            </div>
            <div style={{ display: 'block' }}>
            <p className="aadhaar-info-label" style={{ margin: '0 0 1rem 0', fontWeight: '700', color: 'var(--neutral-800)' }}>जानकारी प्रकार चुनें</p>

            <div className="aadhaar-choice-grid">
              {[
                { id: 'aadhaar', icon: '🪪', title: 'आधार कार्ड', helper: '12 अंक' },
                { id: 'enrollment', icon: '📝', title: 'एनरोलमेंट नंबर', helper: '28 अंक' },
                { id: 'remark', icon: '💬', title: 'रिमार्क', helper: 'कोई टिप्पणी' }
              ].map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`aadhaar-choice ${aadhaarInfo.type === choice.id ? 'active' : ''} ${choice.id === 'remark' && aadhaarInfo.type === choice.id ? 'remark-active' : ''}`}
                  onClick={() => handleAadhaarTypeChange(choice.id)}
                >
                  <span className="aadhaar-choice-icon">{choice.icon}</span>
                  <strong>{choice.title}</strong>
                  <small>{choice.helper}</small>
                </button>
              ))}
            </div>

            {aadhaarInfo.type === 'aadhaar' && (
              <div className="aadhaar-input-block">
                <label className="aadhaar-field-label" htmlFor="aadhaarNumber">आधार कार्ड नंबर <span>*</span></label>
                <input
                  id="aadhaarNumber"
                  className="aadhaar-entry-input"
                  inputMode="numeric"
                  maxLength="12"
                  placeholder="XXXX XXXX XXXX"
                  value={aadhaarInfo.aadhaarNumber}
                  onChange={(e) => updateAadhaarInfo('aadhaarNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                />
                <div className="aadhaar-input-meta">
                  <span>केवल 12 अंक दर्ज करें (बिना स्पेस)</span>
                  <strong>{aadhaarInfo.aadhaarNumber.length}/12</strong>
                </div>
              </div>
            )}

            {aadhaarInfo.type === 'enrollment' && (
              <div className="aadhaar-input-block">
                <label className="aadhaar-field-label" htmlFor="enrollmentNumber">एनरोलमेंट नंबर <span>*</span></label>
                <input
                  id="enrollmentNumber"
                  className="aadhaar-entry-input"
                  inputMode="numeric"
                  maxLength="28"
                  placeholder="XXXX/XXXXX/XXXXXXXX"
                  value={aadhaarInfo.enrollmentNumber}
                  onChange={(e) => updateAadhaarInfo('enrollmentNumber', e.target.value.replace(/\D/g, '').slice(0, 28))}
                />
                <div className="aadhaar-input-meta">
                  <span>28 अंक दर्ज करें (उदा: 1234/56789/12345678)</span>
                  <strong>{aadhaarInfo.enrollmentNumber.length}/28</strong>
                </div>
              </div>
            )}

            {aadhaarInfo.type === 'remark' && (
              <div className="aadhaar-remark-block">
                <p>उप-विकल्प चुनें:</p>
                <div className="aadhaar-remark-list">
                  {aadhaarRemarkOptions.map((option) => (
                    <label key={option} className="aadhaar-remark-option">
                      <input
                        type="radio"
                        name="aadhaarRemark"
                        checked={aadhaarInfo.remark === option}
                        onChange={() => updateAadhaarInfo('remark', option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  minHeight: '62px',
                  borderRadius: '16px',
                  border: '2px solid rgba(20, 110, 140, 0.7)',
                  background: '#f2f6f8',
                  color: '#0f172a',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  boxShadow: 'inset 0 0 0 1px rgba(20, 110, 140, 0.15)',
                  cursor: 'pointer'
                }}
              >
                रद्द करें
              </button>
              <button
                type="button"
                disabled={!isAadhaarReady}
                onClick={() => {
                  if (validateAadhaarInfo()) {
                    setStep(3);
                  }
                }}
                style={{
                  flex: 1,
                  minHeight: '62px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0d8d76 0%, #0a9c78 100%)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  boxShadow: '0 8px 18px rgba(12, 128, 109, 0.26)',
                  cursor: !isAadhaarReady ? 'not-allowed' : 'pointer',
                  opacity: !isAadhaarReady ? 0.7 : 1
                }}
              >
                सहेजें
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}></div>
        </div>
      )}

      {/* STEP 3: RATION CARD SCREEN */}
      {step === 3 && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--neutral-800)' }}>
              राशन कार्ड की जानकारी भरें
            </h2>
          </div>

          {validationError && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
              <AlertTriangle size={20} />
              <span>{validationError}</span>
            </div>
          )}

          <div className="card" style={{ padding: '1.5rem', borderRadius: '18px', border: '1px solid var(--neutral-200)', background: '#fff', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: '700', color: 'var(--neutral-900)' }}>
              क्या परिवार के पास राशन कार्ड है?
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
              {[
                { id: 'yes', icon: '✅', title: 'हाँ, राशन कार्ड है', helper: '12 अंक' },
                { id: 'no', icon: '❌', title: 'नहीं है', helper: 'नहीं' }
              ].map((choice) => {
                const isSelected = rationInfo.hasRationCard === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => updateRationInfo('hasRationCard', choice.id)}
                    style={{
                      textAlign: 'left',
                      padding: '1.25rem 1rem',
                      borderRadius: '16px',
                      border: isSelected ? '2px solid #2563eb' : '1.5px solid #d9e1ec',
                      background: isSelected ? '#edf4ff' : '#f8fafc',
                      color: '#0f172a',
                      boxShadow: isSelected ? '0 0 0 4px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      minHeight: '170px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isSelected ? '#dfeafe' : '#e6edf8',
                      color: isSelected ? '#1d4ed8' : '#475569',
                      fontSize: '2rem',
                      lineHeight: 1
                    }}>
                      {choice.icon}
                    </span>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', marginTop: '0.1rem' }}>{choice.title}</div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '500' }}>{choice.helper}</div>
                  </button>
                );
              })}
            </div>

            {rationInfo.hasRationCard === 'yes' && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--neutral-200)' }}>
                <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.95rem', fontWeight: '700', color: 'var(--neutral-800)' }} htmlFor="rationNumber">
                  12 अंकीय राशन कार्ड क्रमांक <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="rationNumber"
                  inputMode="numeric"
                  maxLength="12"
                  placeholder="XXXXXXXXXXXX"
                  value={rationInfo.rationNumber}
                  onChange={(e) => updateRationInfo('rationNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                  style={{
                    width: '100%',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    padding: '0.9rem 1rem',
                    fontSize: '1rem',
                    outline: 'none',
                    background: '#fff',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                  <span>केवल 12 अंक दर्ज करें</span>
                  <strong style={{ color: '#0f172a' }}>{rationInfo.rationNumber.replace(/\D/g, '').length}/12</strong>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                flex: 1,
                minHeight: '62px',
                borderRadius: '16px',
                border: '2px solid rgba(20, 110, 140, 0.7)',
                background: '#f2f6f8',
                color: '#0f172a',
                fontSize: '1.2rem',
                fontWeight: '700',
                boxShadow: 'inset 0 0 0 1px rgba(20, 110, 140, 0.15)',
                cursor: 'pointer'
              }}
            >
              रद्द करें
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateRationInfo()) {
                  setStep(4);
                }
              }}
              disabled={!isRationReady}
              style={{
                flex: 1,
                minHeight: '62px',
                borderRadius: '16px',
                border: 'none',
                background: 'linear-gradient(135deg, #0d8d76 0%, #0a9c78 100%)',
                color: '#fff',
                fontSize: '1.2rem',
                fontWeight: '700',
                boxShadow: '0 8px 18px rgba(12, 128, 109, 0.26)',
                cursor: !isRationReady ? 'not-allowed' : 'pointer',
                opacity: !isRationReady ? 0.7 : 1
              }}
            >
              सहेजें
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: MOBILE NUMBER SCREEN */}
      {step === 4 && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--neutral-800)' }}>
              मोबाइल नंबर की जानकारी भरें
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--neutral-600)' }}>
              10 अंकों का मोबाइल नंबर दर्ज करें. यदि मोबाइल नंबर उपलब्ध नहीं है, तो 0000000000 दर्ज करें.
            </p>
          </div>

          {validationError && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
              <AlertTriangle size={20} />
              <span>{validationError}</span>
            </div>
          )}

          <div className="card" style={{ padding: '1.5rem', borderRadius: '18px', border: '1px solid var(--neutral-200)', background: '#fff', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--neutral-900)', margin: 0 }}>मोबाइल नंबर की जानकारी भरें</h2>
            </div>

            <div>
              <div className="aadhaar-input-block" style={{ marginTop: '0' }}>
                <label className="aadhaar-field-label" htmlFor="mobileNumber">मोबाइल नंबर <span>*</span></label>
                <input
                  id="mobileNumber"
                  className="aadhaar-entry-input"
                  inputMode="numeric"
                  maxLength="10"
                  placeholder="0000000000"
                  value={mobileInfo.mobileNumber}
                  onChange={(e) => updateMobileInfo(e.target.value)}
                />
                <div className="aadhaar-input-meta">
                  <span>10 अंक दर्ज करें; अगर उपलब्ध नहीं है, तो 0000000000 मान्य होगा</span>
                  <strong>{mobileInfo.mobileNumber.replace(/\D/g, '').length}/10</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setStep(3)}
                style={{
                  flex: 1,
                  minHeight: '62px',
                  borderRadius: '16px',
                  border: '2px solid rgba(20, 110, 140, 0.7)',
                  background: '#f2f6f8',
                  color: '#0f172a',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  boxShadow: 'inset 0 0 0 1px rgba(20, 110, 140, 0.15)',
                  cursor: 'pointer'
                }}
              >
                रद्द करें
              </button>
              <button
                type="button"
                disabled={!isMobileReady}
                onClick={() => {
                  if (validateMobileInfo()) {
                    setStep(5);
                  }
                }}
                style={{
                  flex: 1,
                  minHeight: '62px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0d8d76 0%, #0a9c78 100%)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  boxShadow: '0 8px 18px rgba(12, 128, 109, 0.26)',
                  cursor: !isMobileReady ? 'not-allowed' : 'pointer',
                  opacity: !isMobileReady ? 0.7 : 1
                }}
              >
                सहेजें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW SCREEN */}
      {step === 5 && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '18px', border: '1px solid var(--neutral-200)', background: '#fff', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.5rem' }}>
            Survey Summary & Review (समीक्षा)
          </h2>

          {validationError && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
              <AlertTriangle size={20} />
              <span>{validationError}</span>
            </div>
          )}

          <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--neutral-200)' }}>
            <h4 style={{ fontSize: '0.95rem', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>Beneficiary Overview</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><strong>Name:</strong> {beneficiary.name}</div>
              <div><strong>ID:</strong> {beneficiary.id}</div>
              <div><strong>Village:</strong> {beneficiary.village}</div>
            </div>
          </div>

          <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--neutral-200)' }}>
            <h4 style={{ fontSize: '0.95rem', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>आधार जानकारी</h4>
            <div style={{ fontSize: '0.9rem' }}>
              {aadhaarInfo.type === 'aadhaar' && <span><strong>आधार कार्ड:</strong> {aadhaarInfo.aadhaarNumber}</span>}
              {aadhaarInfo.type === 'enrollment' && <span><strong>एनरोलमेंट नंबर:</strong> {aadhaarInfo.enrollmentNumber}</span>}
              {aadhaarInfo.type === 'remark' && <span><strong>रिमार्क:</strong> {aadhaarInfo.remark}</span>}
            </div>
          </div>

          <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--neutral-200)' }}>
            <h4 style={{ fontSize: '0.95rem', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>राशन कार्ड की जानकारी</h4>
            <div style={{ fontSize: '0.9rem' }}>
              {rationInfo.hasRationCard === 'yes' ? (
                <span><strong>राशन कार्ड:</strong> {rationInfo.rationNumber}</span>
              ) : (
                <span><strong>राशन कार्ड:</strong> नहीं है</span>
              )}
            </div>
          </div>

          <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--neutral-200)' }}>
            <h4 style={{ fontSize: '0.95rem', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>मोबाइल नंबर की जानकारी</h4>
            <div style={{ fontSize: '0.9rem' }}>
              <span><strong>मोबाइल नंबर:</strong> {mobileInfo.mobileNumber}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '1.25rem', borderRadius: 'var(--radius-lg)', background: hasIssue ? 'var(--danger-bg)' : 'var(--success-bg)', border: `2px solid ${hasIssue ? 'var(--danger-border)' : 'var(--success-border)'}`, marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '0.9rem', textTransform: 'uppercase', tracking: '1px', fontWeight: '700', color: hasIssue ? 'var(--danger)' : 'var(--success)' }}>
              Overall Result (अंतिम परिणाम)
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', marginTop: '0.25rem', color: hasIssue ? 'var(--danger)' : 'var(--success)' }}>
              {hasIssue ? '🔴 ISSUE FOUND' : '🟢 VERIFIED'}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => setStep(4)}
              style={{
                flex: 1,
                minHeight: '62px',
                borderRadius: '16px',
                border: '2px solid rgba(20, 110, 140, 0.7)',
                background: '#f2f6f8',
                color: '#0f172a',
                fontSize: '1.2rem',
                fontWeight: '700',
                boxShadow: 'inset 0 0 0 1px rgba(20, 110, 140, 0.15)',
                cursor: 'pointer'
              }}
            >
              रद्द करें
            </button>
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              style={{
                flex: 1,
                minHeight: '62px',
                borderRadius: '16px',
                border: 'none',
                background: 'linear-gradient(135deg, #0d8d76 0%, #0a9c78 100%)',
                color: '#fff',
                fontSize: '1.2rem',
                fontWeight: '700',
                boxShadow: '0 8px 18px rgba(12, 128, 109, 0.26)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.75 : 1
              }}
            >
              {isSubmitting ? 'Saving...' : 'सहेजें'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: SUBMISSION SUCCESS SCREEN */}
      {step === 6 && (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', borderRadius: '18px', border: '1px solid var(--neutral-200)', background: '#fff', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <CheckCircle size={48} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--neutral-900)', marginBottom: '0.5rem' }}>
            Survey Successfully Completed
          </h2>
          <p style={{ color: 'var(--neutral-600)', marginBottom: '1.5rem' }}>
            सर्वे सफलतापूर्वक दर्ज कर लिया गया है।
          </p>

          <div style={{ background: 'var(--neutral-50)', padding: '1.25rem', borderRadius: 'var(--radius-md)', maxWidth: '400px', margin: '0 auto 2rem auto', textAlign: 'left', border: '1px solid var(--neutral-200)' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <span className="form-label">Survey ID:</span>
              <strong style={{ color: 'var(--primary)' }}>{submittedSurvey?.surveyId || localSurveyId}</strong>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span className="form-label">Beneficiary Name:</span>
              <strong>{beneficiary.name}</strong>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span className="form-label">Survey Date:</span>
              <span>{submittedSurvey?.surveyDate || new Date().toLocaleString()}</span>
            </div>
            <div>
              <span className="form-label">Overall Status:</span>
              <span className={`badge ${overallResultText === 'VERIFIED' ? 'badge-success' : 'badge-danger'}`}>
                {overallResultText}
              </span>
            </div>
          </div>

          <button className="btn btn-primary" onClick={onCancel}>
            Back to Assigned Beneficiaries
          </button>
        </div>
      )}
    </div>
  );
}

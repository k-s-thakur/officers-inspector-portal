import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Home, Moon, ShieldCheck, SunMedium, Users } from 'lucide-react';

import { appConfig } from './config';
import { getBootstrapData, saveSurvey } from './services/appsScriptApi';
import ReportsDashboard from './components/ReportsDashboard';
import SurveyorDashboard from './components/SurveyorDashboard';
import SurveyWizard from './components/SurveyWizard';

export default function App() {
  const [theme, setTheme] = useState(appConfig.defaultTheme);
  const [currentUser] = useState(appConfig.currentUser);
  const [activeView, setActiveView] = useState('dashboard');

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [issueTypes, setIssueTypes] = useState([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadBootstrapData = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    setLoadError('');

    try {
      const data = await getBootstrapData();
      setBeneficiaries(Array.isArray(data?.beneficiaries) ? data.beneficiaries : []);
      setParameters(Array.isArray(data?.parameters) ? data.parameters : []);
      setIssueTypes(Array.isArray(data?.issues) ? data.issues : []);
    } catch (error) {
      console.error('Bootstrap API failed:', error);
      setBeneficiaries([]);
      setParameters([]);
      setIssueTypes([]);
      setLoadError(error instanceof Error && error.message
        ? `डेटा लोड नहीं हो सका: ${error.message}`
        : 'डेटा लोड नहीं हो सका। कृपया backend/API connection check करें।');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    loadBootstrapData()
      .catch((error) => {
        if (mounted) console.error('Unexpected bootstrap failure:', error);
      })

    return () => {
      mounted = false;
    };
  }, [loadBootstrapData]);

  const handleSelectBeneficiary = (beneficiary) => {
    setSelectedBeneficiary(beneficiary);
    setActiveView('beneficiaries');
  };

  const handleSubmitSurvey = async ({
    beneficiaryId,
    responses,
    aadhaarInfo,
    rationInfo,
    mobileInfo,
    overallResult
  }) => {
    const now = new Date();
    const surveyId = `${appConfig.surveyIdPrefix}-${now.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const surveyDate = now.toISOString().replace('T', ' ').substring(0, 16);

    await saveSurvey({
      beneficiaryId,
      responses,
      aadhaarInfo,
      rationInfo,
      mobileInfo,
      overallResult,
      surveyId,
      surveyDate,
      submittedBy: currentUser.id
    });

    await loadBootstrapData({ showLoading: false });

    setSelectedBeneficiary((previous) => {
      if (!previous || previous.id !== beneficiaryId) return previous;

      return {
        ...previous,
        status: overallResult === 'VERIFIED' ? 'Completed' : 'Issue Found',
        overallResult,
        surveyId,
        surveyDate,
        aadhaarInfo,
        rationInfo,
        mobileInfo,
        parameterResponses: responses
      };
    });

    return { surveyId, surveyDate };
  };

  const renderDataState = () => {
    if (loading) {
      return (
        <div className="empty-state-table loading-state">
          <span className="loading-spinner" aria-hidden="true" />
          <span>डेटा लोड हो रहा है...</span>
        </div>
      );
    }

    if (loadError) {
      return <div className="empty-state-table">{loadError}</div>;
    }

    if (beneficiaries.length === 0) {
      return <div className="empty-state-table">कोई रिकॉर्ड नहीं मिला।</div>;
    }

    return null;
  };

  const isDark = theme === 'dark';
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'beneficiaries', label: 'Beneficiaries', icon: Users },
    { id: 'reports', label: 'Reports', icon: BarChart3 }
  ];

  return (
    <div
      className="app-container"
      style={{
        background: isDark ? '#0f172a' : '#f8fafc',
        color: isDark ? '#e2e8f0' : '#111827'
      }}
    >
      <main className="main-content" style={{ background: isDark ? '#0f172a' : '#f8fafc' }}>
        <header
          className="top-header"
          style={{
            background: 'linear-gradient(90deg, #f1fffb 0%, #f8fffd 54%, #f6fffc 100%)',
            border: '1px solid #dff6ee',
            borderBottom: '1px solid #dff6ee',
            minHeight: '58px',
            padding: '0.45rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            width: '100%',
            margin: '0',
            flexWrap: 'nowrap',
            borderRadius: '0',
            boxShadow: 'none'
          }}
        >
          <div
            className="app-brand"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              flex: '0 0 245px',
              minWidth: 0,
              paddingLeft: '0'
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #12d692 0%, #05a86c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 18px rgba(16, 185, 129, 0.28), inset 0 0 0 2px rgba(255, 255, 255, 0.35)',
                flexShrink: 0
              }}
            >
              <ShieldCheck size={16} color="white" strokeWidth={2.4} />
            </div>
            <div className="brand-copy">
              <span
                className="brand-title"
                style={{
                  fontWeight: '800',
                  fontSize: '0.95rem',
                  color: '#0f172a',
                  lineHeight: 1.2,
                  letterSpacing: '0',
                  whiteSpace: 'nowrap'
                }}
              >
                {appConfig.appName}
              </span>
              <small className="brand-department">{appConfig.departmentName}</small>
            </div>
          </div>

          <div
            className="app-nav"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '2.2rem',
              flex: '1 1 auto',
              minWidth: 0,
              marginLeft: 'auto'
            }}
          >
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeView === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`app-nav-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveView(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    minWidth: isActive ? '132px' : '124px',
                    flex: '0 0 auto',
                    height: '36px',
                    padding: isActive ? '0.35rem 0.95rem' : '0.35rem 0.55rem',
                    borderRadius: '999px',
                    border: '1px solid transparent',
                    outline: 'none',
                    background: isActive ? '#e7f8f1' : 'transparent',
                    color: isActive ? '#0f172a' : '#111827',
                    fontSize: '0.9rem',
                    fontWeight: isActive ? '800' : '700',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: 'none'
                  }}
                >
                  <Icon size={14} strokeWidth={2.25} />
                  <span className="app-nav-label">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="Toggle theme"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '1px solid #d8f5eb',
              background: '#ffffff',
              color: '#11b981',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 7px 18px rgba(15, 118, 110, 0.08)',
              transition: 'all 0.2s ease',
              marginLeft: 'auto',
              flexShrink: 0
            }}
          >
            {isDark ? <SunMedium size={14} /> : <Moon size={14} />}
          </button>
        </header>

        <div className="page-body" style={{ maxWidth: '100%', paddingLeft: 0, paddingRight: 0, margin: '0 auto' }}>
          {renderDataState() || (selectedBeneficiary ? (
            <div className="view-panel survey-view-panel" style={{ marginTop: '0.5rem' }}>
              <SurveyWizard
                beneficiary={selectedBeneficiary}
                parameters={parameters}
                issueTypes={issueTypes}
                onSubmitSurvey={handleSubmitSurvey}
                onCancel={() => setSelectedBeneficiary(null)}
              />
            </div>
          ) : (
            <>
              {activeView === 'dashboard' && (
                <div className="view-panel">
                  <SurveyorDashboard
                    beneficiaries={beneficiaries}
                    currentUser={currentUser}
                    onSelectBeneficiary={handleSelectBeneficiary}
                    showOverview={true}
                    showQueue={false}
                  />
                </div>
              )}

              {activeView === 'beneficiaries' && (
                <div className="view-panel">
                  <SurveyorDashboard
                    beneficiaries={beneficiaries}
                    currentUser={currentUser}
                    onSelectBeneficiary={handleSelectBeneficiary}
                    showOverview={false}
                    showQueue={true}
                  />
                </div>
              )}

              {activeView === 'reports' && (
                <div className="view-panel">
                  <ReportsDashboard
                    beneficiaries={beneficiaries}
                    currentUser={currentUser}
                    issueTypes={issueTypes}
                  />
                </div>
              )}
            </>
          ))}
        </div>
      </main>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Filter,
  MapPinned,
  Printer,
  Search,
  UserRound,
  X
} from 'lucide-react';
import { appConfig } from '../config';

const REPORT_TABS = [
  'Survey Report',
  'Verified Beneficiary Report',
  'Pending Survey Report',
  'Block-wise Report',
  'Date-wise Report'
];

const STATUS_OPTIONS = ['', 'Completed', 'Pending'];
const TAB_KEY_MAP = {
  'Survey Report': 'survey',
  'Verified Beneficiary Report': 'verified',
  'Pending Survey Report': 'pending',
  'Block-wise Report': 'location',
  'Date-wise Report': 'date'
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const escapeCsv = (value) => {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const buildTableRows = (beneficiaries, activeTab) => {
  if (activeTab === 'survey') {
    return beneficiaries.map((b) => ({
      id: b.id,
      name: b.name,
      janpad: b.block || 'Unknown',
      gp: b.gp || 'Unknown',
      gram: b.village || 'Unknown',
      status: b.status || 'Pending',
      date: b.surveyDate || '-'
    }));
  }

  if (activeTab === 'verified') {
    return beneficiaries.map((b) => {
      const aadhaar = b.aadhaarInfo || {};
      const hasAadhaar = !!(aadhaar.type || aadhaar.aadhaarNumber || aadhaar.enrollmentNumber || aadhaar.remark);

      return {
        id: b.id,
        name: b.name,
        janpad: b.block || 'Unknown',
        gp: b.gp || 'Unknown',
        gram: b.village || 'Unknown',
        aadhaarStatus: hasAadhaar ? 'Verified' : 'Pending',
        verifiedStatus: hasAadhaar ? 'Verified Beneficiary' : 'Not Verified',
        status: b.status || 'Pending'
      };
    });
  }

  if (activeTab === 'pending') {
    return beneficiaries
      .filter((b) => b.status === 'Pending')
      .map((b) => ({
        id: b.id,
        name: b.name,
        janpad: b.block || 'Unknown',
        gp: b.gp || 'Unknown',
        gram: b.village || 'Unknown',
        status: b.status || 'Pending',
        date: b.surveyDate || '-'
      }));
  }

  if (activeTab === 'location') {
    const groups = beneficiaries.reduce((acc, item) => {
      const key = `${item.block || 'Unknown'}|${item.gp || 'Unknown'}|${item.village || 'Unknown'}`;
      if (!acc[key]) {
        acc[key] = {
          janpad: item.block || 'Unknown',
          gp: item.gp || 'Unknown',
          gram: item.village || 'Unknown',
          totalSurvey: 0,
          completed: 0,
          pending: 0
        };
      }
      acc[key].totalSurvey += 1;
      if (item.status === 'Completed') {
        acc[key].completed += 1;
      } else {
        acc[key].pending += 1;
      }
      return acc;
    }, {});

    return Object.values(groups).sort((a, b) => b.totalSurvey - a.totalSurvey);
  }

  if (activeTab === 'date') {
    return beneficiaries
      .filter((b) => b.surveyDate)
      .map((b) => ({
      id: b.id,
      name: b.name,
      janpad: b.block || 'Unknown',
        gp: b.gp || 'Unknown',
        gram: b.village || 'Unknown',
        date: formatDate(b.surveyDate),
        status: b.status || 'Pending'
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  return beneficiaries.map((b) => ({
    id: b.id,
    name: b.name,
    janpad: b.block || 'Unknown',
    gp: b.gp || 'Unknown',
    gram: b.village || 'Unknown',
    status: b.status || 'Pending',
    date: b.surveyDate || '-'
  }));
};

export default function ReportsDashboard({ beneficiaries, currentUser, issueTypes = [] }) {
  const [activeTab, setActiveTab] = useState('Survey Report');
  const [search, setSearch] = useState('');
  const [janpadFilter, setJanpadFilter] = useState('');
  const [gpFilter, setGpFilter] = useState('');
  const [gramFilter, setGramFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [issueTypeFilter, setIssueTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exportMode, setExportMode] = useState('');
  const pageSize = 8;

  const distinctJanpads = [...new Set(beneficiaries.map((b) => b.block).filter(Boolean))];
  const distinctGps = [...new Set(beneficiaries.filter((b) => !janpadFilter || b.block === janpadFilter).map((b) => b.gp).filter(Boolean))];
  const distinctGrams = [...new Set(beneficiaries.filter((b) => (!janpadFilter || b.block === janpadFilter) && (!gpFilter || b.gp === gpFilter)).map((b) => b.village).filter(Boolean))];

  const hasAadhaarIssue = (beneficiary) => {
    const responses = beneficiary.parameterResponses || {};
    const issueText = Object.values(responses)
      .map((response) => response?.issueType || '')
      .join(' ')
      .toLowerCase();

    return /aadhaar|आधार/.test(issueText) || /aadhaar|आधार/.test(String(beneficiary.aadhaarInfo?.remark || '').toLowerCase());
  };

  const hasRationIssue = (beneficiary) => beneficiary.rationInfo?.hasRationCard === 'no';

  const isVerifiedBeneficiary = (beneficiary) => {
    const aadhaar = beneficiary.aadhaarInfo || {};
    const hasAadhaar = !!(aadhaar.type || aadhaar.aadhaarNumber || aadhaar.enrollmentNumber || aadhaar.remark);
    const hasRation = beneficiary.rationInfo?.hasRationCard === 'yes';
    return hasAadhaar && hasRation;
  };

  const issueTypeOptions = useMemo(() => [
    'Aadhaar Issue',
    'Ration Card Issue',
    'Survey Completed',
    'Survey Pending',
    'Verified Beneficiary'
  ], []);

  const issueMatchesSelectedType = (beneficiary, selectedIssueType) => {
    if (!selectedIssueType) return true;

    const issueText = Object.values(beneficiary.parameterResponses || {})
      .map((response) => response?.issueType || '')
      .join(' ')
      .toLowerCase();

    const normalizedType = selectedIssueType.toLowerCase();

    if (selectedIssueType === 'Aadhaar Issue') return hasAadhaarIssue(beneficiary);
    if (selectedIssueType === 'Ration Card Issue') return hasRationIssue(beneficiary);
    if (selectedIssueType === 'Survey Completed') return beneficiary.status === 'Completed';
    if (selectedIssueType === 'Survey Pending') return beneficiary.status === 'Pending';
    if (selectedIssueType === 'Verified Beneficiary') return isVerifiedBeneficiary(beneficiary);

    return Object.values(beneficiary.parameterResponses || {})
      .some((response) => {
        const value = String(response?.issueType || '').toLowerCase();
        return value.includes(normalizedType) || normalizedType.includes(value);
      }) || issueText.includes(normalizedType);
  };

  const filteredBeneficiaries = useMemo(() => {
    const q = search.toLowerCase();
    return beneficiaries.filter((b) => {
      const text = `${b.name || ''} ${b.id || ''} ${b.fatherName || ''} ${b.gp || ''} ${b.village || ''}`.toLowerCase();
      const matchesSearch = !q || text.includes(q);
      const matchesJanpad = !janpadFilter || b.block === janpadFilter;
      const matchesGp = !gpFilter || b.gp === gpFilter;
      const matchesGram = !gramFilter || b.village === gramFilter;
      const matchesStatus = !statusFilter || b.status === statusFilter;
      const matchesIssueType = issueMatchesSelectedType(b, issueTypeFilter);

      const itemDate = b.surveyDate ? new Date(b.surveyDate) : null;
      const matchesFrom = !dateFrom || !itemDate || itemDate >= new Date(dateFrom);
      const matchesTo = !dateTo || !itemDate || itemDate <= new Date(`${dateTo}T23:59:59`);

      return matchesSearch && matchesJanpad && matchesGp && matchesGram && matchesStatus && matchesIssueType && matchesFrom && matchesTo;
    });
  }, [beneficiaries, search, janpadFilter, gpFilter, gramFilter, statusFilter, issueTypeFilter, dateFrom, dateTo, currentUser.name]);

  const reportRows = useMemo(() => buildTableRows(filteredBeneficiaries, TAB_KEY_MAP[activeTab]), [filteredBeneficiaries, activeTab]);
  const totalPages = Math.max(1, Math.ceil(reportRows.length / pageSize));
  const paginatedRows = reportRows.slice((page - 1) * pageSize, page * pageSize);

  const resetFilters = () => {
    setSearch('');
    setJanpadFilter('');
    setGpFilter('');
    setGramFilter('');
    setStatusFilter('');
    setIssueTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const exportCsv = (rows, fileName) => {
    const headers = Object.keys(rows[0] || {});
    const csv = [headers, ...rows.map((row) => headers.map((header) => escapeCsv(row[header])))]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openExportPreview = (mode) => {
    setExportMode(mode);
    setPreviewOpen(true);
  };

  const handleExcelExport = () => {
    exportCsv(reportRows, `${TAB_KEY_MAP[activeTab]}-report.csv`);
  };

  const handlePdfExport = () => {
    window.print();
  };

  const headersByTab = {
    survey: ['ID', 'Name', 'Block', 'Gram Panchayat', 'Gram', 'Status', 'Survey Date'],
    verified: ['ID', 'Name', 'Block', 'Gram Panchayat', 'Gram', 'Aadhaar Status', 'Verified Status'],
    pending: ['ID', 'Name', 'Block', 'Gram Panchayat', 'Gram', 'Status', 'Survey Date'],
    location: ['Block', 'Gram Panchayat', 'Gram', 'Total Survey', 'Completed', 'Pending'],
    date: ['ID', 'Name', 'Block', 'Gram Panchayat', 'Gram', 'Survey Date', 'Status']
  };

  const renderCellValue = (row, header) => {
    const keyMap = {
      ID: 'id',
      Name: 'name',
      Block: 'janpad',
      'Gram Panchayat': 'gp',
      Gram: 'gram',
      Status: 'status',
      'Survey Date': 'date',
      Surveyor: 'surveyor',
      'Aadhaar Status': 'aadhaarStatus',
      Submission: 'submission',
      'Verified Status': 'verifiedStatus',
      'Total Survey': 'totalSurvey',
      Completed: 'completed',
      Pending: 'pending',
      'Surveyor Name': 'surveyor',
      'Total Assigned': 'totalAssigned',
      'Completion %': 'completionPercent'
    };

    const key = keyMap[header];
    const value = row[key];
    if (header === 'Completion %') return `${((row.completed / (row.totalAssigned || 1)) * 100).toFixed(1)}%`;
    if (header === 'Status' && value === 'Completed') return <span className="report-badge success">Completed</span>;
    if (header === 'Status' && value === 'Pending') return <span className="report-badge neutral">Pending</span>;
    if (header === 'Status' && value === 'Issue Found') return <span className="report-badge danger">Issue Found</span>;
    if (header === 'Aadhaar Status' && value === 'Verified') return <span className="report-badge success">Verified</span>;
    if (header === 'Aadhaar Status' && value === 'Issue') return <span className="report-badge danger">Aadhaar Issue</span>;
    if (header === 'Aadhaar Status') return <span className="report-badge neutral">Pending</span>;
    if (header === 'Verified Status' && value === 'Verified Beneficiary') return <span className="report-badge success">Verified Beneficiary</span>;
    if (header === 'Verified Status') return <span className="report-badge neutral">Not Verified</span>;
    return value ?? '—';
  };

  const tableHeaders = headersByTab[TAB_KEY_MAP[activeTab]] || headersByTab.survey;
  const issueFoundCount = filteredBeneficiaries.filter((b) => b.status === 'Issue Found').length;
  const completedCount = filteredBeneficiaries.filter((b) => b.status === 'Completed').length;
  const totalMembersCount = filteredBeneficiaries.length;
  const aadhaarIssueCount = filteredBeneficiaries.filter(hasAadhaarIssue).length;
  const verifiedBeneficiaryCount = filteredBeneficiaries.filter((b) => {
    const aadhaar = b.aadhaarInfo || {};
    const hasAadhaar = !!(aadhaar.type || aadhaar.aadhaarNumber || aadhaar.enrollmentNumber || aadhaar.remark);
    const hasRation = b.rationInfo?.hasRationCard === 'yes';
    return hasAadhaar && hasRation;
  }).length;
  const rationIssueCount = filteredBeneficiaries.filter((b) => b.rationInfo?.hasRationCard === 'no').length;

  const summaryCards = [
    {
      key: 'total-members',
      label: 'कुल सदस्य',
      value: totalMembersCount,
      tone: 'slate',
      helper: 'All records'
    },
    {
      key: 'aadhaar-issue',
      label: 'Aadhaar Issue',
      value: aadhaarIssueCount,
      tone: 'rose',
      helper: 'Needs review'
    },
    {
      key: 'verified-beneficiary',
      label: 'Verified Beneficiary',
      value: verifiedBeneficiaryCount,
      tone: 'emerald',
      helper: 'Aadhaar + Ration'
    },
    {
      key: 'ration-issue',
      label: 'Ration Issue',
      value: rationIssueCount,
      tone: 'amber',
      helper: 'No ration card'
    },
    {
      key: 'completed-survey',
      label: 'Completed Survey',
      value: completedCount,
      tone: 'blue',
      helper: `Issue Found: ${issueFoundCount} • Completed: ${completedCount}`
    }
  ];

  const blockSummaryRows = useMemo(() => {
    const grouped = filteredBeneficiaries.reduce((acc, item) => {
      const key = item.block || 'Unknown';
      if (!acc[key]) {
        acc[key] = { Block: key, Total: 0, Completed: 0, Pending: 0 };
      }
      acc[key].Total += 1;
      if (item.status === 'Completed') acc[key].Completed += 1;
      else acc[key].Pending += 1;
      return acc;
    }, {});

    return Object.values(grouped);
  }, [filteredBeneficiaries]);

  const gpSummaryRows = useMemo(() => {
    const grouped = filteredBeneficiaries.reduce((acc, item) => {
      const key = item.gp || 'Unknown';
      if (!acc[key]) {
        acc[key] = { GP: key, Total: 0, Completed: 0, Pending: 0 };
      }
      acc[key].Total += 1;
      if (item.status === 'Completed') acc[key].Completed += 1;
      else acc[key].Pending += 1;
      return acc;
    }, {});

    return Object.values(grouped);
  }, [filteredBeneficiaries]);

  const reasoningRows = useMemo(() => {
    const rows = [];
    filteredBeneficiaries.forEach((beneficiary) => {
      const responses = beneficiary.parameterResponses || {};
      Object.values(responses).forEach((response) => {
        if (response?.issueType) {
          rows.push({
            id: beneficiary.id,
            name: beneficiary.name,
            block: beneficiary.block || 'Unknown',
            gp: beneficiary.gp || 'Unknown',
            gram: beneficiary.village || 'Unknown',
            issueType: response.issueType,
            remark: response.remark || '—',
            status: beneficiary.status || 'Pending'
          });
        }
      });
    });
    return rows;
  }, [filteredBeneficiaries]);

  const filledRows = useMemo(() => filteredBeneficiaries.map((beneficiary) => ({
    id: beneficiary.id,
    name: beneficiary.name,
    block: beneficiary.block || 'Unknown',
    gp: beneficiary.gp || 'Unknown',
    gram: beneficiary.village || 'Unknown',
    status: beneficiary.status || 'Pending',
    aadhaar: beneficiary.aadhaarInfo?.type || '—',
    ration: beneficiary.rationInfo?.hasRationCard || '—'
  })), [filteredBeneficiaries]);

  const exportTiles = [
    { key: 'filtered-excel', label: 'Filtered Excel', icon: FileSpreadsheet, action: () => openExportPreview('excel') },
    { key: 'block-excel', label: 'Block Excel', icon: FileSpreadsheet, action: () => openExportPreview('excel') },
    { key: 'block-pdf', label: 'Block PDF', icon: Printer, action: () => openExportPreview('pdf') },
    { key: 'gp-excel', label: 'GP Excel', icon: FileSpreadsheet, action: () => openExportPreview('excel') },
    { key: 'gp-pdf', label: 'GP PDF', icon: Printer, action: () => openExportPreview('pdf') },
    { key: 'aadhaar-issue-excel', label: 'Aadhaar Issue', icon: FileSpreadsheet, action: () => { setIssueTypeFilter('Aadhaar Issue'); setPage(1); openExportPreview('excel'); } },
    { key: 'ration-issue-excel', label: 'Ration Card Issue', icon: FileSpreadsheet, action: () => { setIssueTypeFilter('Ration Card Issue'); setPage(1); openExportPreview('excel'); } },
    { key: 'survey-completed-excel', label: 'Survey Completed', icon: FileSpreadsheet, action: () => { setStatusFilter('Completed'); setPage(1); openExportPreview('excel'); } },
    { key: 'survey-pending-excel', label: 'Survey Pending', icon: FileSpreadsheet, action: () => { setStatusFilter('Pending'); setPage(1); openExportPreview('excel'); } },
    { key: 'verified-beneficiary-excel', label: 'Verified Beneficiary', icon: FileSpreadsheet, action: () => { setIssueTypeFilter('Verified Beneficiary'); setPage(1); openExportPreview('excel'); } },
    { key: 'aadhaar-issue-pdf', label: 'Aadhaar Issue PDF', icon: Printer, action: () => { setIssueTypeFilter('Aadhaar Issue'); setPage(1); openExportPreview('pdf'); } },
    { key: 'ration-issue-pdf', label: 'Ration Card Issue PDF', icon: Printer, action: () => { setIssueTypeFilter('Ration Card Issue'); setPage(1); openExportPreview('pdf'); } },
    { key: 'survey-completed-pdf', label: 'Survey Completed PDF', icon: Printer, action: () => { setStatusFilter('Completed'); setPage(1); openExportPreview('pdf'); } },
    { key: 'survey-pending-pdf', label: 'Survey Pending PDF', icon: Printer, action: () => { setStatusFilter('Pending'); setPage(1); openExportPreview('pdf'); } },
    { key: 'verified-beneficiary-pdf', label: 'Verified Beneficiary PDF', icon: Printer, action: () => { setIssueTypeFilter('Verified Beneficiary'); setPage(1); openExportPreview('pdf'); } }
  ];

  return (
    <div className="report-shell">
      <section className="report-summary-card">
        <div className="report-title-row">
          <BarChart3 size={32} />
          <h1>{appConfig.appName} Reports</h1>
        </div>
        <p className="report-subtitle">
          {currentUser.district || appConfig.currentUser.district || 'All'} District • {beneficiaries.length} Records
        </p>
      </section>

      <div className="report-kpi-grid">
        {summaryCards.map((card) => (
          <div key={card.key} className={`report-kpi-card ${card.tone}`}>
            <div className="report-kpi-label">{card.label}</div>
            <div className="report-kpi-value">{card.value}</div>
            <div className="report-kpi-helper">{card.helper}</div>
          </div>
        ))}
      </div>

      <div className="report-export-grid" aria-label="Report export actions">
        {exportTiles.map(({ key, label, icon: Icon, action }) => (
          <button key={key} type="button" className="report-export-tile" onClick={action}>
            <span className="report-export-icon"><Icon size={16} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="report-panel card">
        <div className="report-toolbar-header">
          <div className="report-toolbar-title">
            <Filter size={18} />
            <span>{activeTab}</span>
          </div>
          <div className="report-action-row">
            <button type="button" className="report-action-btn light" onClick={resetFilters}>Reset Filter</button>
            <button type="button" className="report-action-btn light" onClick={() => openExportPreview('excel')}>
              <FileSpreadsheet size={16} /> Excel Export
            </button>
            <button type="button" className="report-action-btn light" onClick={() => openExportPreview('pdf')}>
              <Printer size={16} /> PDF Export
            </button>
          </div>
        </div>

        <div className="report-search-row">
          <div className="report-search-box">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search beneficiary, ID, GP, village..."
            />
          </div>
        </div>

        <div className="report-filter-grid">
          <label>
            <span>Block</span>
            <select value={janpadFilter} onChange={(e) => { setJanpadFilter(e.target.value); setGpFilter(''); setGramFilter(''); setPage(1); }}>
              <option value="">All</option>
              {distinctJanpads.map((janpad) => (
                <option key={janpad} value={janpad}>{janpad}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Gram Panchayat</span>
            <select value={gpFilter} onChange={(e) => { setGpFilter(e.target.value); setGramFilter(''); setPage(1); }}>
              <option value="">All</option>
              {distinctGps.map((gp) => (
                <option key={gp} value={gp}>{gp}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Gram</span>
            <select value={gramFilter} onChange={(e) => { setGramFilter(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {distinctGrams.map((gram) => (
                <option key={gram} value={gram}>{gram}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Survey Status</span>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {STATUS_OPTIONS.filter(Boolean).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Issue Type</span>
            <select value={issueTypeFilter} onChange={(e) => { setIssueTypeFilter(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {issueTypeOptions.map((issueType) => (
                <option key={issueType} value={issueType}>{issueType}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Date Range</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </label>

          <label>
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </label>

        </div>
      </div>

      <div className="report-table-panel card">
        <div className="report-table-header">
          <div>
            <h3>{activeTab}</h3>
            <span>{reportRows.length} records</span>
          </div>
        </div>

        <div className="table-container">
          <table className="custom-table report-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={tableHeaders.length} className="empty-state-table">No records found for this filter.</td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr key={`${activeTab}-${index}`}>
                    {tableHeaders.map((header) => (
                      <td key={`${activeTab}-${header}-${index}`} data-label={header}>{renderCellValue(row, header)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="report-pagination">
          <button type="button" disabled={page === 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Next</button>
        </div>
      </div>

      {previewOpen && (
        <div className="report-preview-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="report-preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="report-preview-header">
              <div>
                <h3>{activeTab}</h3>
                <span>{exportMode ? `${exportMode === 'excel' ? 'Excel' : 'PDF'} preview` : 'Printable preview'}</span>
              </div>
              <button type="button" className="report-close-button" onClick={() => { setPreviewOpen(false); setExportMode(''); }}>
                <X size={18} />
              </button>
            </div>

            <div className="table-container preview-table-wrap">
              <table className="custom-table report-table">
                <thead>
                  <tr>
                    {tableHeaders.map((header) => (
                      <th key={`preview-${header}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={tableHeaders.length} className="empty-state-table">No preview data available.</td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => (
                      <tr key={`preview-row-${index}`}>
                        {tableHeaders.map((header) => (
                          <td key={`preview-cell-${header}-${index}`} data-label={header}>{renderCellValue(row, header)}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="report-preview-actions">
              <button type="button" className="report-action-btn light" onClick={() => { setPreviewOpen(false); setExportMode(''); }}>Close</button>
              <button type="button" className="report-action-btn" onClick={() => { if (exportMode === 'pdf') { handlePdfExport(); } else { handleExcelExport(); } setPreviewOpen(false); setExportMode(''); }}>
                {exportMode === 'pdf' ? <><Printer size={16} /> Download PDF</> : <><Download size={16} /> Download Excel</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

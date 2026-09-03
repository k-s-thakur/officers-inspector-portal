import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Home,
  Phone,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';

const hindiGender = {
  Male: 'पुरुष',
  Female: 'महिला',
  Other: 'अन्य'
};

const statusHindi = {
  Pending: 'खाली',
  Completed: 'भरा',
  'Issue Found': 'समस्या'
};

const getGroupStats = (items, key) => {
  const groups = items.reduce((acc, item) => {
    const label = item[key] || 'Unknown';

    if (!acc[label]) {
      acc[label] = {
        label,
        total: 0,
        villages: new Set(),
        completed: 0,
        pending: 0,
        issue: 0,
        returned: 0
      };
    }

    acc[label].total += 1;
    acc[label].villages.add(item.village || 'Unknown');

    if (item.status === 'Completed') {
      acc[label].completed += 1;
    } else if (item.status === 'Issue Found') {
      acc[label].issue += 1;

    } else {
      acc[label].pending += 1;
    }

    return acc;
  }, {});

  return Object.values(groups)
    .map((group) => ({
      ...group,
      villageCount: group.villages.size,
      filled: group.completed + group.issue,
      percent: group.total ? Math.round(((group.completed + group.issue) / group.total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
};

function DistributionTable({ title, rows, type }) {
  return (
    <article className="card detail-table-card no-section-header">
      {title && (
        <div className="distribution-table-caption">
          <span className="distribution-table-badge">📋</span>
          <span>{title}</span>
        </div>
      )}
      <div className="detail-table-wrap">
        <table className="detail-table">
          <thead>
            <tr>
              <th>{type === 'block' ? 'ब्लॉक' : 'ग्राम पंचायत'}</th>
              <th>कुल</th>
              <th>गांव</th>
              <th>भरे</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.label}>
                <td data-label={type === 'block' ? 'Block' : 'Gram Panchayat'}>
                  <span className={`name-pill pill-${index % 4}`}>{row.label}</span>
                </td>
                <td data-label="Total">{row.total.toLocaleString('en-IN')}</td>
                <td data-label="Villages">{row.villageCount.toLocaleString('en-IN')}</td>
                <td data-label="Filled" className="filled-count">{row.filled.toLocaleString('en-IN')}</td>
                <td data-label="Percent" className="percent-count">{row.percent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function SurveyorDashboard({
  beneficiaries,
  currentUser,
  onSelectBeneficiary,
  showOverview = true,
  showQueue = true
}) {
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [gpFilter, setGpFilter] = useState('');
  const [villageFilter, setVillageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [summaryFocus, setSummaryFocus] = useState('all');

  const currentUserId = String(currentUser?.id || '').trim();
  const userAssignedList = currentUserId
    ? beneficiaries.filter((b) => String(b.assignedSurveyorId || '').trim() === currentUserId)
    : [];
  const assignedList = currentUserId && userAssignedList.length ? userAssignedList : beneficiaries;
  const blockOptions = [...new Set(assignedList.map((b) => b.block).filter(Boolean))];
  const gpOptions = [...new Set(assignedList.filter((b) => !blockFilter || b.block === blockFilter).map((b) => b.gp).filter(Boolean))];
  const villageOptions = [...new Set(assignedList.filter((b) => (!blockFilter || b.block === blockFilter) && (!gpFilter || b.gp === gpFilter)).map((b) => b.village).filter(Boolean))];

  const filteredList = assignedList.filter((b) => {
    const query = search.toLowerCase();
    const matchesSearch =
      String(b.name || '').toLowerCase().includes(query) ||
      String(b.id || '').toLowerCase().includes(query) ||
      (b.fatherName || '').toLowerCase().includes(query) ||
      (b.gp || '').toLowerCase().includes(query) ||
      (b.village || '').toLowerCase().includes(query) ||
      String(b.mobile || '').includes(search);

    const matchesBlock = !blockFilter || b.block === blockFilter;
    const matchesGp = !gpFilter || b.gp === gpFilter;
    const matchesVillage = !villageFilter || b.village === villageFilter;
    const matchesStatus = !statusFilter || b.status === statusFilter;
    const matchesGender = !genderFilter || b.gender === genderFilter;

    return matchesSearch && matchesBlock && matchesGp && matchesVillage && matchesStatus && matchesGender;
  });

  const totalAssigned = assignedList.length;
  const completed = assignedList.filter((b) => b.status === 'Completed').length;
  const pending = assignedList.filter((b) => b.status === 'Pending').length;
  const aadhaarIssueCount = assignedList.filter((b) => {
    const responses = b.parameterResponses || {};
    const issueText = Object.values(responses)
      .map((response) => response?.issueType || '')
      .join(' ')
      .toLowerCase();

    return /aadhaar|आधार/.test(issueText) || /aadhaar|आधार/.test(String(b.aadhaarInfo?.remark || '').toLowerCase());
  }).length;
  const verifiedBeneficiaryCount = assignedList.filter((b) => {
    const aadhaar = b.aadhaarInfo || {};
    const hasAadhaar = !!(aadhaar.type || aadhaar.aadhaarNumber || aadhaar.enrollmentNumber || aadhaar.remark);
    const hasRation = b.rationInfo?.hasRationCard === 'yes';
    return hasAadhaar && hasRation;
  }).length;
  const aadhaarTypeStats = [
    {
      label: 'आधार नंबर',
      value: assignedList.filter((b) => b.aadhaarInfo?.type === 'aadhaar').length,
      color: '#60a5fa'
    },
    {
      label: 'एनरोलमेंट',
      value: assignedList.filter((b) => b.aadhaarInfo?.type === 'enrollment').length,
      color: '#fbbf24'
    },
    {
      label: 'रिमार्क',
      value: assignedList.filter((b) => b.aadhaarInfo?.type === 'remark').length,
      color: '#f87171'
    },
    {
      label: 'राशन कार्ड नंबर',
      value: assignedList.filter((b) => b.rationInfo?.hasRationCard === 'yes' && String(b.rationInfo?.rationNumber || '').trim().length > 0).length,
      color: '#34d399'
    },
    {
      label: 'राशन कार्ड नहीं है',
      value: assignedList.filter((b) => b.rationInfo?.hasRationCard === 'no').length,
      color: '#fb7185'
    }
  ];
  const maxAadhaarTypeValue = Math.max(...aadhaarTypeStats.map((stat) => stat.value), 1);
  const completionRate = totalAssigned ? Math.round((completed / totalAssigned) * 100) : 0;
  const blockStats = getGroupStats(assignedList, 'block');

  const locationRows = assignedList.reduce((acc, item) => {
    const key = item.block || 'Unknown';
    if (!acc[key]) {
      acc[key] = {
        block: item.block || 'Unknown',
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

  const locationTableRows = Object.values(locationRows).sort((a, b) => {
    return (b.totalSurvey + b.completed) - (a.totalSurvey + a.completed) || a.block.localeCompare(b.block);
  });

  const gpRows = assignedList.reduce((acc, item) => {
    const key = item.gp || 'Unknown';
    if (!acc[key]) {
      acc[key] = {
        gp: item.gp || 'Unknown',
        block: item.block || 'Unknown',
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

  const gpTableRows = Object.values(gpRows).sort((a, b) => {
    return (b.totalSurvey + b.completed) - (a.totalSurvey + a.completed) || a.gp.localeCompare(b.gp);
  });

  const statCards = [
    {
      key: 'total',
      label: 'कुल सदस्य',
      value: totalAssigned,
      icon: Users,
      tone: 'blue',
      helper: `${completionRate}% प्रगति`
    },
    {
      key: 'aadhaar-issue',
      label: 'Aadhaar Issue',
      value: aadhaarIssueCount,
      icon: AlertTriangle,
      tone: 'rose',
      helper: 'Needs Aadhaar review'
    },
    {
      key: 'verified-beneficiary',
      label: 'Verified Beneficiary',
      value: verifiedBeneficiaryCount,
      icon: CheckCircle,
      tone: 'emerald',
      helper: 'Aadhaar valid'
    },
    {
      key: 'completed',
      label: 'Completed Survey',
      value: completed,
      icon: CheckCircle,
      tone: 'emerald',
      helper: 'Completed records'
    },
    {
      key: 'pending',
      label: 'Pending Survey',
      value: pending,
      icon: Clock,
      tone: 'red',
      helper: 'Requires action'
    }
  ];

  return (
    <div className="dashboard-shell">
      {showOverview && (
        <>
          <section className="dashboard-overview-card">
            <div className="dashboard-overview-header">
              <div>
                <div className="dashboard-overview-kicker">Survey dashboard</div>
                <h1 className="dashboard-overview-title">Ayushman Survey Dantewada</h1>
              </div>
              <div className="dashboard-overview-badge">
                <span className="dashboard-overview-dot" />
                <span>{completionRate}% Progress</span>
              </div>
            </div>
          </section>

          <section className="dashboard-summary-grid">
            {statCards.map((card) => {
              const Icon = card.icon;
              const isSelected = summaryFocus === card.key;

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setSummaryFocus(card.key)}
                  className={`dashboard-summary-card ${isSelected ? 'selected' : ''}`}
                  style={{
                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #dfeaf5',
                    background: isSelected ? '#edf4ff' : '#ffffff'
                  }}
                >
                  <div className="dashboard-summary-icon">
                    <Icon size={20} />
                  </div>
                  <div className="dashboard-summary-content">
                    <div className="dashboard-summary-label">{card.label}</div>
                    <div className="dashboard-summary-value">{card.value}</div>
                    <div className="dashboard-summary-helper">{card.helper}</div>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="dashboard-overview-main-grid">
            <div className="dashboard-progress-panel panel-card">
              <div className="dashboard-panel-header">
                <div className="dashboard-panel-title">Survey Progress</div>
                <div className="dashboard-panel-value">{completionRate}%</div>
              </div>

              <div className="dashboard-metric-mini-grid">
                <div className="dashboard-mini-metric">
                  <div className="dashboard-mini-label">Total Survey</div>
                  <div className="dashboard-mini-value">{totalAssigned}</div>
                </div>
                <div className="dashboard-mini-metric">
                  <div className="dashboard-mini-label">Completed</div>
                  <div className="dashboard-mini-value">{completed}</div>
                </div>
                <div className="dashboard-mini-metric">
                  <div className="dashboard-mini-label">Pending</div>
                  <div className="dashboard-mini-value">{pending}</div>
                </div>
              </div>

              <div className="dashboard-progress-bar">
                <div className="dashboard-progress-fill" style={{ width: `${completionRate}%` }} />
              </div>
            </div>
          </section>

          <section className="panel-card" style={{ padding: '1rem 1.25rem 1.1rem', marginTop: '1.2rem' }}>
            <div className="dashboard-panel-title" style={{ marginBottom: '0.9rem', fontSize: '1.05rem' }}>आधार / राशन / मोबाइल डेटा (भरे हुए रिकॉर्ड में)</div>

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {aadhaarTypeStats.map((stat) => (
                <div key={stat.label} className="dashboard-data-row" style={{ display: 'grid', gridTemplateColumns: '180px minmax(180px, 1fr) 60px', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.96rem' }}>{stat.label}</div>
                  <div style={{ position: 'relative', height: '32px', borderRadius: '10px', overflow: 'hidden', background: '#e5e7eb' }}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${(stat.value / maxAadhaarTypeValue) * 100}%`,
                        background: stat.color,
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingLeft: '0.75rem',
                        color: '#0f172a',
                        fontWeight: 700,
                        fontSize: '0.9rem'
                      }}
                    >
                      {stat.value.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700, color: '#334155', fontSize: '0.96rem' }}>
                    {stat.value.toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-table-panel panel-card dashboard-location-panel">
            <div className="dashboard-panel-title dashboard-table-title">Block-wise Survey</div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table dashboard-location-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th className="text-right">Total Survey</th>
                    <th className="text-right">Completed</th>
                    <th className="text-right">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {locationTableRows.map((row) => (
                    <tr key={row.block}>
                      <td data-label="Block">{row.block}</td>
                      <td data-label="Total Survey" className="text-right strong-cell">{row.totalSurvey}</td>
                      <td data-label="Completed" className="text-right completed-cell">{row.completed}</td>
                      <td data-label="Pending" className="text-right pending-cell">{row.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-table-panel panel-card dashboard-gp-panel">
            <div className="dashboard-recent-header">
              <div className="dashboard-panel-title">Gram Panchayat-wise Report</div>
            </div>

            <div className="dashboard-table-wrap">
              <table className="dashboard-table dashboard-recent-table">
                <thead>
                  <tr>
                    <th>Gram Panchayat</th>
                    <th>Block</th>
                    <th className="text-right">Total Survey</th>
                    <th className="text-right">Completed</th>
                    <th className="text-right">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {gpTableRows.map((row) => (
                    <tr key={row.gp}>
                      <td data-label="Gram Panchayat" className="dashboard-beneficiary-name">{row.gp}</td>
                      <td data-label="Block">{row.block}</td>
                      <td data-label="Total Survey" className="text-right strong-cell">{row.totalSurvey}</td>
                      <td data-label="Completed" className="text-right completed-cell">{row.completed}</td>
                      <td data-label="Pending" className="text-right pending-cell">{row.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {showQueue && (
      <section className="member-dashboard">
        <div className="member-filter-card">
          <div className="member-search-row">
            <Search size={22} />
            <input
              type="text"
              placeholder="नाम, गाँव, मोबाइल खोजें..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="member-filter-grid">
            <select value={blockFilter} onChange={(e) => setBlockFilter(e.target.value)}>
              <option value="">सभी ब्लॉक</option>
              {blockOptions.map((block) => (
                <option key={block} value={block}>{block}</option>
              ))}
            </select>

            <select value={gpFilter} onChange={(e) => setGpFilter(e.target.value)}>
              <option value="">सभी ग्राम पंचायत</option>
              {gpOptions.map((gp) => (
                <option key={gp} value={gp}>{gp}</option>
              ))}
            </select>

            <select value={villageFilter} onChange={(e) => setVillageFilter(e.target.value)}>
              <option value="">सभी गाँव</option>
              {villageOptions.map((village) => (
                <option key={village} value={village}>{village}</option>
              ))}
            </select>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">बाकी / खाली</option>
              <option value="Pending">खाली</option>
              <option value="Completed">भरा</option>
              <option value="Issue Found">समस्या</option>
            </select>

            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
              <option value="">सभी लिंग</option>
              <option value="Male">पुरुष</option>
              <option value="Female">महिला</option>
              <option value="Other">अन्य</option>
            </select>
          </div>
        </div>

        <div className="member-list-card">
          <div className="member-list-header">
            <h2>सदस्य सूची</h2>
            <span>{filteredList.length} रिकॉर्ड (पृष्ठ 1/1)</span>
          </div>

          <div className="member-table-wrap">
            <table className="member-table">
              <thead>
                <tr>
                  <th>क्र.</th>
                  <th>ब्लॉक</th>
                  <th>ग्राम पंचायत</th>
                  <th>गाँव</th>
                  <th>पिता/पति/मुखिया</th>
                  <th>सदस्य</th>
                  <th>लिंग / आयु</th>
                  <th>स्थिति</th>
                  <th>समय</th>
                  <th>कॉल</th>
                  <th>कार्य</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="empty-state">
                      चयनित फिल्टर में कोई सदस्य नहीं मिला।
                    </td>
                  </tr>
                ) : (
                  filteredList.map((beneficiary, index) => (
                    <tr key={beneficiary.id}>
                      <td data-label="क्र.">{index + 1}</td>
                      <td data-label="ब्लॉक">{beneficiary.block}</td>
                      <td data-label="ग्राम पंचायत">{beneficiary.gp}</td>
                      <td data-label="गांव">{beneficiary.village}</td>
                      <td data-label="मुखिया">
                        <div className="guardian-cell">
                          <span>मुखिया: {beneficiary.fatherName}</span>
                          <strong>पिता/पति का नाम: {beneficiary.fatherName}</strong>
                        </div>
                      </td>
                      <td data-label="सदस्य" className="member-name">{beneficiary.name}</td>
                      <td data-label="Gender / Age">{hindiGender[beneficiary.gender] || beneficiary.gender} / {beneficiary.age} वर्ष</td>
                      <td data-label="Status">
                        <span className={`member-status ${beneficiary.status === 'Completed' ? 'filled' : ''}`}>
                          <span />
                          {statusHindi[beneficiary.status] || beneficiary.status}
                        </span>
                      </td>
                      <td data-label="Time">{beneficiary.surveyDate ? beneficiary.surveyDate.slice(11, 16) : '-'}</td>
                      <td data-label="Call">
                        <a className="call-btn" href={`tel:${beneficiary.mobile}`} aria-label={`${beneficiary.name} को कॉल करें`}>
                          <Phone size={16} />
                          <span>-</span>
                        </a>
                      </td>
                      <td data-label="Action">
                        <button
                          className="edit-member-btn"
                          type="button"
                          onClick={() => onSelectBeneficiary(beneficiary)}
                        >
                          संपादित
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

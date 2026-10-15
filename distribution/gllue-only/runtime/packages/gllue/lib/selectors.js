/**
 * Gllue 页面选择器集合
 *
 * 注意：不同 Gllue 租户、不同版本的选择器可能不同。
 * 页面升级后请更新此处选择器。
 */

export const selectors = {
  // 登录页 (Limewing Talents / laowaihere.gllue.com)
  login: {
    usernameInput: 'input[name="emailOrMobile"]',
    passwordInput: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    rememberCheckbox: 'label:has-text("记住用户名")',
    forgotPasswordLink: 'a:has-text("忘记密码？")'
  },

  // 全局导航/用户区
  global: {
    navBase: '#nav_base',
    dashboardLink: '[data-test="navigation$dashboard"] a',
    clientLink: '[data-test="navigation$client"] a',
    joborderLink: '[data-test="navigation$joborder"] a',
    candidateLink: '[data-test="navigation$candidate"] a',
    todoLink: '[data-test="navigation$todo"] a',
    userAvatar: '[data-test="navigation-action$avatar"]',
    userName: '[data-test="navigation-action$avatar"] span[title]',
    quickSearchButton: '[data-test="navigation-action$quick-search"]',
    quickAddButton: '[data-test="navigation-action$quick-add"]'
  },

  // 候选人搜索页 (Limewing Talents / laowaihere.gllue.com)
  candidateSearch: {
    sidebarSearchInput: '[data-test="sidebar-filter-search:candidate"] input',
    savedFilterItems: '[data-test="list-sidebar-filter:candidate"]',
    facetTreeNodes: '[data-test^="facet-tree-node$"]',
    resultRow: '.grid-row.grid-body-row, .grid-body-row',
    candidateName: '.candidate-name, .name, h3, a[href*="/crm/candidate/detail"]',
    candidateIdFromLink: 'a[href*="/crm/candidate/detail"]',
    paginationNext: '.ant-pagination-next, .next-page, .pagination-next',
    loadMoreButton: 'button:has-text("加载更多")'
  },

  // 候选人详情页
  candidateDetail: {
    name: '[data-test="detail-name:candidate"]',
    phone: '[data-test="detail-card-field:candidate$mobile"]',
    email: '[data-test="detail-card-field:candidate$email"]',
    company: '[data-test="detail-card-field:candidate$company"]',
    title: '[data-test="detail-card-field:candidate$title"]',
    location: '.location',
    salary: '[data-test="detail-card-field:candidate$currentSalary"], [data-test="detail-card-field:candidate$expectedSalary"]',
    status: '[data-test="detail-card-field:candidate$status"]',
    experienceSection: '.work-experience, .experience-section',
    educationSection: '.education-section, .edu-section'
  },

  // 职位/项目搜索页 (Limewing Talents 中项目名为 joborder)
  jobSearch: {
    savedFilterItems: '[data-test="list-sidebar-filter:joborder"]',
    resultRow: '.grid-body-row',
    jobTitle: '[data-test="list-table-data-grid:joborder$jobTitle"] a',
    jobIdFromLink: 'a[href*="/crm/joborder/detail"]'
  },

  // 职位详情页
  jobDetail: {
    detailTab: '[data-test="detail-tab$\u8be6\u60c5"] a',
    name: '[data-test="detail-name:joborder"]',
    client: '[data-test="detail-field:joborder$client"] .field-container',
    location: '[data-test="detail-field:joborder$citys"] .field-container',
    salary: '[data-test="detail-field:joborder$annualSalary"] .field-container',
    description: '[data-test="detail-field:joborder$description"] .field-container',
    function: '[data-test="detail-field:joborder$function"] .field-container',
    status: '[data-test="detail-field:joborder$jobStatus"] .field-container',
    openDate: '[data-test="detail-field:joborder$openDate"] .field-container',
    closeDate: '[data-test="detail-field:joborder$closeDate"] .field-container'
  },

  // 候选人详情页 - 投递记录（右侧边栏）
  applyHistory: {
    container: '.apply-history-sidebar, .apply-events-render',
    selectedJobText: '.apply-history__select--text',
    pipelineSteps: '.mysteps-step-segment',
    stepCircle: '.mysteps-step-circle',
    stepCirclePrev: '.mysteps-step-circle--prev',
    stepCircleCurrent: '.mysteps-step-circle--current',
    stepCircleNext: '.mysteps-step-circle--next',
    stepLabel: '.mysteps-label',
    expandButton: 'button:has-text("展开更多")'
  }
};

export default selectors;

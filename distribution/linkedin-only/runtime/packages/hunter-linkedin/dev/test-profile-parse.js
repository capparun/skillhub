import { cli, Strategy } from '@jackwener/opencli/registry';

/**
 * LinkedIn 个人主页简历解析测试
 * 验证：能否访问 LinkedIn 个人主页并提取完整简历信息
 *
 * LinkedIn 个人主页 URL 格式:
 *   https://www.linkedin.com/in/{profile-url-name}/
 *   例如: https://www.linkedin.com/in/williamhgates/
 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'linkedin',
  name: 'test-profile-parse',
  access: 'read',
  description: '测试 LinkedIn 个人主页简历解析（含深层提取）',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'profileUrl', type: 'string', required: true, description: 'LinkedIn 个人主页 URL' },
    { name: 'scroll', type: 'boolean', default: true, description: '是否滚动页面加载全部内容' },
  ],
  func: async (page, kwargs) => {
    console.log('\n=== LinkedIn 个人主页简历解析测试 ===\n');

    const { profileUrl, scroll } = kwargs;
    console.log(`访问 URL: ${profileUrl}`);
    console.log(`滚动加载: ${scroll ? '是' : '否'}`);

    // 1. 导航到个人主页
    await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(4000);

    // 2. 检查登录状态
    const currentUrl = await page.evaluate(`(() => window.location.href)()`);
    console.log(`当前页面: ${currentUrl}`);

    if (currentUrl.includes('login') || currentUrl.includes('auth')) {
      console.log('\n❌ 未登录 - 需要先登录 LinkedIn');
      return { success: false, error: 'not_logged_in' };
    }

    // 3. 滚动页面以加载全部内容（LinkedIn 使用懒加载）
    if (scroll) {
      console.log('\n📜 滚动加载页面内容...');
      // 3.1 点击所有 "显示更多" / "Show more" 按钮
      const expandResult = await page.evaluate(`(() => {
        let clicked = 0;
        const buttons = document.querySelectorAll('button, span, a');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === '显示更多' || text === 'Show more' ||
              text === '展开' || text === 'Expand' ||
              text === '显示全部' || text === 'Show all' ||
              text === '查看更多' || text === 'See more') {
            try {
              btn.click();
              clicked++;
            } catch (e) {}
          }
        }
        return clicked;
      })()`);
      console.log(`   展开 ${expandResult} 个折叠内容`);
      await sleep(1500);

      // 3.2 向下滚动触发懒加载
      for (let i = 0; i < 6; i++) {
        await page.evaluate(`window.scrollBy(0, 800)`);
        await sleep(1000);

        // 滚动过程中继续点击新出现的 "显示更多" 按钮
        const newExpands = await page.evaluate(`(() => {
          let clicked = 0;
          const buttons = document.querySelectorAll('button, span, a');
          for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === '显示更多' || text === 'Show more' ||
                text === '展开' || text === 'Expand') {
              try { btn.click(); clicked++; } catch (e) {}
            }
          }
          return clicked;
        })()`);
        if (newExpands > 0) {
          console.log(`   滚动${i + 1}: 展开 ${newExpands} 个新内容`);
          await sleep(800);
        }
      }
      console.log('   ✅ 页面滚动完成');
      await sleep(2000);
    }

    // 4. 截图
    const screenshotPath = '/tmp/linkedin-profile-test.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 截图已保存: ${screenshotPath}`);

    // 4.5 诊断：检查页面上有哪些 section
    const sectionCheck = await page.evaluate(`(() => {
      const text = document.body ? document.body.innerText : '';
      const hasExp = text.includes('Experience') || text.includes('工作经历');
      const hasEdu = text.includes('Education') || text.includes('教育经历');
      const hasSkills = text.includes('Skills') || text.includes('技能');
      const hasAbout = text.includes('About') || text.includes('关于');
      const hasLogin = text.includes('Sign in') || text.includes('登录') || text.includes('Join now');
      const hasActivity = text.includes('Activity') || text.includes('动态');
      const hasPosts = text.includes('Posts') || text.includes('文章');
      // 找所有 h2 作为 section 标题
      const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).slice(0, 15);
      return JSON.stringify({hasExp, hasEdu, hasSkills, hasAbout, hasLogin, hasActivity, hasPosts, h2s});
    })()`);
    const sections = JSON.parse(sectionCheck || '{}');
    console.log('\n📄 页面 Section 检测:');
    console.log(`   Experience/工作经历: ${sections.hasExp ? '✅' : '❌'}`);
    console.log(`   Education/教育经历: ${sections.hasEdu ? '✅' : '❌'}`);
    console.log(`   Skills/技能: ${sections.hasSkills ? '✅' : '❌'}`);
    console.log(`   About/关于: ${sections.hasAbout ? '✅' : '❌'}`);
    console.log(`   Activity/动态: ${sections.hasActivity ? '✅' : '❌'}`);
    console.log(`   Login/登录按钮: ${sections.hasLogin ? '⚠️ 检测到' : '✅ 未检测到'}`);
    if (sections.h2s && sections.h2s.length > 0) {
      console.log(`   H2 标题: ${sections.h2s.join(' | ')}`);
    }

    // 5. 提取完整简历信息
    console.log('\n🔍 提取简历信息...');
    const profileJson = await page.evaluate(`
      (() => {
        const result = {
          name: '',
          headline: '',
          location: '',
          connections: '',
          about: '',
          experiences: [],
          education: [],
          skills: []
        };

        try {
          const bodyText = document.body ? document.body.innerText : '';
          const lines = bodyText.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

          // ========== 基础信息 ==========
          const uiTexts = ['首页','人脉','职位','消息','通知','我','查看','加为','关注',
            '跳过','对于','Business','全部动态','动态','文章','视频','推荐','项目',
            '语言','荣誉奖项','组织','志愿服务','关注中','猜您认识','Posts','Articles','Videos',
            'Projects','Skills','Experience','Education','About','Activity','Connections',
            'Following','People','Companies','Groups','Newsletters','Schools','Events',
            'Products','Services','Show all','显示更多','展开','Expand','收起','Collapse'];

          // 策略0：从页面文本前100行找英文名字
          // 用简单字符检查，避免模板字符串中正则转义问题
          for (let i = 0; i < Math.min(lines.length, 100) && !result.name; i++) {
            const line = lines[i];
            const words = line.split(' ').filter(w => w.length > 0);
            if (words.length >= 2 && words.length <= 4 && line.length >= 4 && line.length <= 40) {
              const allCapitalized = words.every(w => w.charCodeAt(0) >= 65 && w.charCodeAt(0) <= 90);
              if (allCapitalized) {
                const lower = line.toLowerCase();
                const excludeWords = ['linkedin','home','search','jobs','messaging','notifications','profile','activity','posts','articles','videos','skills','experience','education','about','connections','following','people','companies','groups','newsletters','schools','events','products','services','show all','show more','business','new york','san francisco','los angeles','united states'];
                const isExcluded = excludeWords.some(w => lower === w || lower.includes(w));
                if (!isExcluded) {
                  result.name = line;
                  break;
                }
              }
            }
          }

          // 策略1：遍历 h1/h2 找姓名（排除 LinkedIn UI 元素）
          if (!result.name) {
            const allHeadings = document.querySelectorAll('h1, h2');
            for (const h of allHeadings) {
              const text = (h.textContent || '').trim();
              const isUiText = uiTexts.some(ui => text === ui || text.includes(ui));
              if (text.length > 2 && text.length < 60 && !isUiText) {
                if (!result.name) {
                  result.name = text;
                  break;
                }
              }
            }
          }

          // Headline：name 后面的行通常是 headline
          if (result.name) {
            const nameIdx = lines.indexOf(result.name);
            if (nameIdx > -1) {
              for (let i = nameIdx + 1; i < lines.length && i < nameIdx + 5; i++) {
                const line = lines[i];
                if (line.length > 5 && line.length < 120 &&
                    line !== result.name &&
                    !line.includes('首页') && !line.includes('人脉') &&
                    !line.includes('查看') && !line.includes('加为') &&
                    !line.includes('关注') && !line.includes('对于')) {
                  result.headline = line;
                  break;
                }
              }
            }
          }

          // Headline 备用策略
          if (!result.headline) {
            for (const line of lines) {
              if (line.length > 5 && line.length < 120 &&
                  (line.includes(' at ') || line.includes(' @ ') ||
                   line.includes('Founder') || line.includes('Engineer') ||
                   line.includes('Manager') || line.includes('Director') ||
                   line.includes('CEO') || line.includes('Chair') ||
                   line.includes('President') || line.includes('VP') ||
                   line.includes('Chief') || line.includes('Senior') ||
                   line.includes('首席') || line.includes('工程师') ||
                   line.includes('经理') || line.includes('总监'))) {
                result.headline = line;
                break;
              }
            }
          }

          // 地点
          for (const line of lines) {
            if (!result.location && line.length < 60 &&
                line !== result.headline && line !== result.name &&
                (line.includes('市') ||
                 line.includes('Beijing') || line.includes('Shanghai') ||
                 line.includes('Shenzhen') || line.includes('Guangzhou') ||
                 line.includes('Hangzhou') || line.includes('Area') ||
                 line.includes('Greater') || line.includes('Region') ||
                 line.includes('United States') || line.includes('China') ||
                 line.includes('Seattle') || line.includes('New York') ||
                 line.includes('London') || line.includes('Tokyo') ||
                 line.includes('California') || line.includes('Washington'))) {
              result.location = line;
              break;
            }
          }

          // 人脉数
          for (const line of lines) {
            if (!result.connections &&
                (line.match(/\\d+\\s*位*好友/i) ||
                 line.match(/\\d+\\s*connection/i) ||
                 line.match(/\\d+\\s*followers/i))) {
              result.connections = line;
              break;
            }
          }

          // ========== About（个人简介）==========
          const aboutIdx = bodyText.indexOf('关于');
          const aboutIdx2 = bodyText.indexOf('About');
          const aboutStart = aboutIdx > -1 ? aboutIdx : (aboutIdx2 > -1 ? aboutIdx2 : -1);
          if (aboutStart > -1) {
            const aboutSection = bodyText.substring(aboutStart, aboutStart + 3000);
            const aboutLines = aboutSection.split('\\n').map(l => l.trim()).filter(l => l.length > 10);
            // 跳过标题行，取接下来的长文本
            for (let i = 1; i < aboutLines.length && i < 6; i++) {
              const line = aboutLines[i];
              if (line.length > 20 && line.length < 2000 &&
                  !line.includes('显示更多') && !line.includes('Show more') &&
                  !line.includes('展开') && !line.includes('Expand')) {
                result.about = line;
                break;
              }
            }
          }

          // ========== 工作经历（增强解析）==========
          const expMarkers = ['工作经历', 'Experience'];
          let expStart = -1;
          for (const marker of expMarkers) {
            const idx = bodyText.indexOf(marker);
            if (idx > -1) { expStart = idx; break; }
          }

          const eduMarkers = ['教育经历', 'Education'];
          let eduStart = -1;
          for (const marker of eduMarkers) {
            const idx = bodyText.indexOf(marker);
            if (idx > -1) { eduStart = idx; break; }
          }

          if (expStart > -1) {
            const endIdx = eduStart > expStart ? eduStart : Math.min(expStart + 8000, bodyText.length);
            const expSection = bodyText.substring(expStart, endIdx);
            const expLines = expSection.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // LinkedIn 工作经历格式分析：
            // 每段经历通常包含：公司名、职位、时间段、地点、描述
            // 我们通过检测时间段来定位每段经历
            for (let i = 0; i < expLines.length; i++) {
              const line = expLines[i];

              // 检测时间段（多种格式）
              // 中文：2020年1月 - 至今、2018年 - 2022年
              // 英文：Jan 2020 - Present、2018 - 2022
              const isDuration = line.match(/(?:\\d{4}年?\\s*(?:\\d{1,2}月?)?|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\\s\\-~至]+(?:至今|Present|\\d{4}|Now)/i) ||
                                 line.match(/\\d{4}\\s*[\\-~至]+\\s*(?:\\d{4}|至今|Present)/i);

              if (isDuration && line.length < 80) {
                // 向前找公司名（通常是时间段前1-2行）
                let company = '';
                let title = '';

                for (let j = Math.max(0, i - 3); j < i; j++) {
                  const prevLine = expLines[j];
                  if (!company && prevLine.length > 1 && prevLine.length < 80 &&
                      prevLine !== '工作经历' && prevLine !== 'Experience') {
                    // 如果前面一行是 "全职"、"Full-time" 等，再往前找
                    if (prevLine.match(/^全职$|^兼职$|^Full-time$|^Part-time$|^Contract$|^Self-employed$/i)) {
                      if (j > 0) company = expLines[j - 1];
                    } else {
                      company = prevLine;
                    }
                  }
                }

                // 向后找职位（通常是时间段后1行）
                if (i + 1 < expLines.length) {
                  const nextLine = expLines[i + 1];
                  if (nextLine.length > 1 && nextLine.length < 80 &&
                      nextLine !== '显示更多' && nextLine !== 'Show more') {
                    title = nextLine;
                  }
                }

                // 向后找地点
                let location = '';
                if (i + 2 < expLines.length) {
                  const locLine = expLines[i + 2];
                  if (locLine.length < 60 &&
                      (locLine.includes('市') || locLine.includes('Area') ||
                       locLine.includes('Region') || locLine.includes('United States') ||
                       locLine.includes('China') || locLine.includes('Beijing') ||
                       locLine.includes('Shanghai'))) {
                    location = locLine;
                  }
                }

                // 向后找描述（多行，直到下一段时间或 section 结束）
                let description = '';
                for (let k = i + 2; k < Math.min(expLines.length, i + 10); k++) {
                  const descLine = expLines[k];
                  // 如果检测到新的时间段，停止
                  if (descLine.match(/(?:\\d{4}年?|Jan|Feb)[\\s\\-~至]+(?:至今|Present|\\d{4})/i) &&
                      descLine.length < 80) {
                    break;
                  }
                  if (descLine.length > 15 && descLine.length < 500 &&
                      descLine !== '显示更多' && descLine !== 'Show more' &&
                      descLine !== location) {
                    description += descLine + ' ';
                  }
                }

                if (company || title) {
                  // 去重检查
                  const isDuplicate = result.experiences.some(e =>
                    e.company === company && e.duration === line
                  );
                  if (!isDuplicate) {
                    result.experiences.push({
                      title: title || '',
                      company: company || '',
                      duration: line,
                      location: location,
                      description: description.trim().substring(0, 300)
                    });
                  }
                }
              }
            }
          }

          // ========== 教育经历（增强解析）==========
          if (eduStart > -1) {
            const skillStart = bodyText.indexOf('技能');
            const skillStart2 = bodyText.indexOf('Skills');
            const skillIdx = skillStart > -1 ? skillStart : (skillStart2 > -1 ? skillStart2 : -1);

            const endIdx = skillIdx > eduStart ? skillIdx : Math.min(eduStart + 5000, bodyText.length);
            const eduSection = bodyText.substring(eduStart, endIdx);
            const eduLines = eduSection.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            for (let i = 0; i < eduLines.length; i++) {
              const line = eduLines[i];

              // 检测时间
              const isDuration = line.match(/(?:\\d{4}年?|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\\s\\-~至]+(?:\\d{4}|至今|Present)/i) ||
                                 line.match(/\\d{4}\\s*[\\-~至]+\\s*\\d{4}/);

              if (isDuration && line.length < 60) {
                let school = '';
                let degree = '';

                // 向前找学校名
                for (let j = Math.max(0, i - 3); j < i; j++) {
                  const prevLine = eduLines[j];
                  if (!school && prevLine.length > 3 && prevLine.length < 80 &&
                      prevLine !== '教育经历' && prevLine !== 'Education' &&
                      (prevLine.match(/University|College|Institute|学院|大学|School|Academy/i) ||
                       prevLine.match(/^[A-Z][a-zA-Z\\s]+$/))) {
                    school = prevLine;
                  }
                }

                // 向后找学位
                if (i + 1 < eduLines.length) {
                  const nextLine = eduLines[i + 1];
                  if (nextLine.length > 1 && nextLine.length < 80 &&
                      (nextLine.match(/Bachelor|Master|PhD|Doctor|MBA|学士|硕士|博士|本科/i) ||
                       nextLine.match(/^[A-Za-z\\s\\.]+$/))) {
                    degree = nextLine;
                  }
                }

                if (school) {
                  const isDuplicate = result.education.some(e =>
                    e.school === school && e.duration === line
                  );
                  if (!isDuplicate) {
                    result.education.push({
                      school,
                      degree: degree || '',
                      duration: line
                    });
                  }
                }
              }
            }
          }

          // ========== 技能 ==========
          const skillMarkers = ['技能', 'Skills'];
          let skillStart = -1;
          for (const marker of skillMarkers) {
            const idx = bodyText.indexOf(marker);
            if (idx > -1) { skillStart = idx; break; }
          }

          if (skillStart > -1) {
            const nextSectionIdx = bodyText.indexOf('\\n推荐', skillStart);
            const endIdx = nextSectionIdx > skillStart ? nextSectionIdx : Math.min(skillStart + 3000, bodyText.length);
            const skillsSection = bodyText.substring(skillStart, endIdx);
            const skillLines = skillsSection.split('\\n').map(l => l.trim())
              .filter(l => l.length > 1 && l.length < 50);

            for (const skill of skillLines.slice(1, 21)) {
              if (!skill.includes('Show all') && !skill.includes('显示全部') &&
                  !skill.includes('技能') && !skill.includes('Skills') &&
                  !skill.includes('endorsement') && !skill.includes('推荐') &&
                  !skill.includes('取') && !skill.includes('取数') &&
                  skill.match(/[a-zA-Z\\u4e00-\\u9fa5]/)) {
                result.skills.push(skill);
              }
            }
          }

        } catch (e) {
          console.error('解析错误:', e);
        }

        return JSON.stringify(result);
      })()
    `);

    const profile = JSON.parse(profileJson || '{}');

    // 6. 输出结果
    console.log('\n' + '='.repeat(60));
    console.log('📋 简历解析结果');
    console.log('='.repeat(60));
    console.log(`👤 姓名: ${profile.name || '未提取'}`);
    console.log(`💼 职位: ${profile.headline || '未提取'}`);
    console.log(`📍 地点: ${profile.location || '未提取'}`);
    console.log(`🔗 人脉: ${profile.connections || '未提取'}`);

    if (profile.about) {
      console.log(`\n📝 个人简介:`);
      console.log(`   ${profile.about.substring(0, 200)}${profile.about.length > 200 ? '...' : ''}`);
    }

    console.log(`\n💼 工作经历 (${profile.experiences ? profile.experiences.length : 0}条):`);
    if (profile.experiences && profile.experiences.length > 0) {
      profile.experiences.forEach((exp, i) => {
        console.log(`\n   [${i + 1}] ${exp.title || '未知职位'}`);
        console.log(`       公司: ${exp.company || '未知'}`);
        console.log(`       时间: ${exp.duration || ''}`);
        if (exp.location) console.log(`       地点: ${exp.location}`);
        if (exp.description) console.log(`       描述: ${exp.description.substring(0, 120)}${exp.description.length > 120 ? '...' : ''}`);
      });
    } else {
      console.log('   （未提取到，可能需要登录或页面结构不同）');
    }

    console.log(`\n🎓 教育经历 (${profile.education ? profile.education.length : 0}条):`);
    if (profile.education && profile.education.length > 0) {
      profile.education.forEach((edu, i) => {
        console.log(`   [${i + 1}] ${edu.school}`);
        console.log(`       学位: ${edu.degree || '未标注'}`);
        console.log(`       时间: ${edu.duration || ''}`);
      });
    } else {
      console.log('   （未提取到，可能需要登录或页面结构不同）');
    }

    console.log(`\n🛠️ 技能 (${profile.skills ? profile.skills.length : 0}个):`);
    if (profile.skills && profile.skills.length > 0) {
      const skillStr = profile.skills.slice(0, 15).join(', ');
      console.log(`   ${skillStr}${profile.skills.length > 15 ? '...' : ''}`);
    } else {
      console.log('   （未提取到，可能需要登录或页面结构不同）');
    }

    // 7. 检查提取质量
    const hasName = !!(profile && profile.name);
    const hasExperiences = profile.experiences && profile.experiences.length > 0;
    const success = hasName;

    console.log('\n' + '='.repeat(60));
    console.log(`${success ? '✅ 测试通过' : '❌ 测试失败'} - ${success ? '成功提取基本信息' : '未能提取到姓名'}`);
    if (hasExperiences) console.log('✅ 成功提取工作经历');
    console.log('='.repeat(60));

    return {
      success,
      url: currentUrl,
      profile: {
        name: profile.name || '',
        headline: profile.headline || '',
        location: profile.location || '',
        connections: profile.connections || '',
        about: profile.about || '',
        experienceCount: profile.experiences ? profile.experiences.length : 0,
        educationCount: profile.education ? profile.education.length : 0,
        skillCount: profile.skills ? profile.skills.length : 0
      },
      details: profile,
      screenshot: screenshotPath
    };
  }
});

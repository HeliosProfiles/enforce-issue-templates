module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  app.on('issues.opened', async context => {
    const templates = await getAllTemplateContents(context)
    const headersForEachTemplate = parseHeadersFromTemplates(templates)
    const {body, user} = context.payload.issue
    if (!bodyIncludesHeaders(body, headersForEachTemplate)) await postRequestForAdditionalInformation(context, user)
  })
}

async function getAllTemplateContents(context) {
  const issueTemplateDirectoryPath = '.github/ISSUE_TEMPLATE'
  const githubTemplatesDirectoryApiRequest = context.repo({path: issueTemplateDirectoryPath})
  const directoryResult = await context.github.repos.getContents(githubTemplatesDirectoryApiRequest)
  return await Promise.all(directoryResult.data.map(async directoryEntry => {
    const templateName = directoryEntry['name']
    const githubTemplatesFilesApiRequest = context.repo({path: `${issueTemplateDirectoryPath}/${templateName}`})
    const filesResult = await context.github.repos.getContents(githubTemplatesFilesApiRequest)
    return Buffer.from(filesResult.data.content, 'base64').toString()
  }))
}

function parseHeadersFromTemplates(templates) {
  return templates.map(template => {
    const newlineSeparated = template.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split(/\r/);
    return findHeaders(newlineSeparated)
  })
}

function findHeaders(newlineSeparatedTemplate) {
  let headers = []
  for (i = 0; i < newlineSeparatedTemplate.length; i++) {
    const line = newlineSeparatedTemplate[i]
    if (line.includes('#')) {
      headers.push(line)
    }
  }
  return headers
}

function bodyIncludesHeaders(body, headersForEachTemplate) {
  const newlineSeparatedBody = body.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split(/\r/)
  const userHeaders = newlineSeparatedBody.filter(line => line.includes('#'))
  if (userHeaders.length == 0) return false
  return userHeadersEqualAtLeastOneTemplate(userHeaders, headersForEachTemplate)
}

function userHeadersEqualAtLeastOneTemplate(userHeaders, headersForEachTemplate) {
  for (template of headersForEachTemplate) {
    if (template.every(header => userHeaders.includes(header))) return true
  }
  return false
}

async function postRequestForAdditionalInformation(context, user) {
  const replyApiRequest = context.repo({path: '.github/ISSUE_TEMPLATE_REPLY.md'})
  const result = await context.github.repos.getContents(replyApiRequest)
  const reply = `Hello @${user.login}!\n` + Buffer.from(result.data.content, 'base64').toString()

  context.github.issues.createComment(context.issue({body: reply}))
  context.github.issues.addLabels(context.issue({labels: ['more-info-required']}))
}
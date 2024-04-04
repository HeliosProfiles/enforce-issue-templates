module.exports = app => {
  app.on('issues.opened', async context => {
    const { body, user } = context.payload.issue
    const parsedUserHeaders = parseUserHeaders(body)
    const templates = await getAllTemplateContents(context)
    await handleIssueOpened(context, user, parsedUserHeaders, templates)
  })
  app.on('issues.edited', async context => {
    const { body, labels } = context.payload.issue
    const parsedUserHeaders = parseUserHeaders(body)
    const templates = await getAllTemplateContents(context)
    await handleIssueEdited(context, labels, parsedUserHeaders, templates)
  })
}

function parseUserHeaders(body) {
  const newlineSeparatedBody = body.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split(/\r/)
  return newlineSeparatedBody.filter(line => line.startsWith('#'))
}

async function getAllTemplateContents(context) {
  const issueTemplateDirectoryPath = '.github/ISSUE_TEMPLATE'
  const githubTemplatesDirectoryApiRequest = context.repo({path: issueTemplateDirectoryPath})
  const directoryResult = await context.github.repos.getContents(githubTemplatesDirectoryApiRequest)
  return await Promise.all(directoryResult.data.map(async directoryEntry => {
    const templateName = directoryEntry['name']
    const githubTemplatesFilesApiRequest = context.repo({path: `${issueTemplateDirectoryPath}/${templateName}`})
    const filesResult = await context.github.repos.getContents(githubTemplatesFilesApiRequest)
    const body = Buffer.from(filesResult.data.content, 'base64').toString()
    return {
      name: templateName, 
      headers: parseTemplateBody(body)
    }
  }))
}

async function handleIssueOpened(context, user, parsedUserHeaders, templates) {
  const templateToUse = getTemplateToUse(parsedUserHeaders, templates)
  if (templateToUse == null) return
  postIssueOpenedReply(context, user, templateToUse)
}

async function handleIssueEdited(context, labels, parsedUserHeaders, templates) {
  const templateToUse = getTemplateToUse(parsedUserHeaders, templates)
  if (templateToUse != null) return
  removeLabels(context, labels)
  removeComment(context)
}

function parseTemplateBody(template) {
  const newlineSeparated = template.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split(/\r/);
  let headers = []
  for (i = 0; i < newlineSeparated.length; i++) {
    const line = newlineSeparated[i]
    if (line.startsWith('#')) {
      headers.push(line)
    }
  }
  return headers
}

function getTemplateToUse(parsedUserHeaders, templates) {
  let replyNecessary = true
  let templateToUse = {}
  templates.forEach(template => {
    const {_, headers} = template
    if (headers.every(header => parsedUserHeaders.includes(header))) replyNecessary = false
    if (headers.some(header => parsedUserHeaders.includes(header))) templateToUse = template
  })
  return (replyNecessary ? templateToUse : null)
}

async function postIssueOpenedReply(context, user, templateToUse) {
  const templatesLink = 'https://github.com/HeliosVirtualCockpit/Helios/issues/new/choose'
  const headersMessage = getHeadersMessage(templateToUse)
  const reply = 
`
Hello @${user.login}!

It looks like you've posted an issue, but in order for us to best assist you, we need some additional 
information. We have created some issue templates to make this process easier. You can find them 
[here](${templatesLink}).

These templates contain lines that begin with the '#' character. These lines are **headers**. In 
your issue, please leave these headers **as is**, and fill out information relevant to the header
in the space below it.

If you don't think that you have any information relevant to the header, fill the space below it 
with something like 'N/A', or consider using a different template.

These headers are essential in allowing us to recreate and resolve your issue. The more detailed
your issue, the more quickly we can begin working on it.

${headersMessage}

If your issue is not updated to follow a template, it may be removed. If you edit your issue to 
follow a template, the bot will remove its comment.

Thanks for your help in improving Helios!
`

  context.github.issues.createComment(context.issue({body: reply}))
  context.github.issues.addLabels(context.issue({ labels: ['more-info-required'] }))
}

function getHeadersMessage(templateToUse) {
  if (Object.getOwnPropertyNames(templateToUse).length == 0) {
    return `
This bot could not detect which template you were trying to use. Please follow the link above to
find a template to use.`
  }
  let message = `
It looks like you were attempting to use the ${templateToUse.name} template. Copy and paste the
headers, including the '#' character, remove the single quotes, and use it to edit your issue.
That template requires the following headers:\n\n`
  templateToUse.headers.forEach((header) => 
    message += `'${header}'\n`
  )
  return message
}

async function removeLabels(context, labels) {
  if (labels.filter(label => label.name == "more-info-required").length == 0) return
  context.github.issues.removeLabel(context.issue({ name: "more-info-required" }))
}

async function removeComment(context) {
  const comments = await context.github.issues.listComments(context.issue())
  comments.data.forEach(async comment => {
    if (comment.user.login == "enforce-issue-templates[bot]") {
      await context.github.issues.deleteComment(context.issue(comment))
    }
  })
}

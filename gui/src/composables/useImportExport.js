import ProjectStore from '../models/ProjectStore'
import {
  admitProjectDocument,
  normalizeProjectName,
} from '../utils/projectCodec'

/**
 * useImportExport - Composable for import/export operations
 */
export function useImportExport({
  currentProjectName,
  importedProjectData,
  conflictProjectName,
  showImportConflictDialog,
  addLog,
  importIntoSession,
  serializeProjectData,
  showAlert = (title, message) => window.alert(`${title}: ${message}`)
}) {
  function importProject() {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.json'
    fileInput.style.display = 'none'
    
    fileInput.onchange = (event) => {
      const file = event.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target.result)
            validateAndProcessImport(jsonData)
          } catch (error) {
            showAlert('Import failed', 'Invalid JSON file. Please select a valid JSON file.')
          }
        }
        reader.readAsText(file)
      }
      document.body.removeChild(fileInput)
    }
    
    document.body.appendChild(fileInput)
    fileInput.click()
  }

  async function validateAndProcessImport(jsonData) {
    try {
      admitProjectDocument(jsonData)
    } catch (error) {
      showAlert('Import failed', error.message)
      return false
    }

    const normalizedName = normalizeProjectName(jsonData.name)
    const admittedData = structuredClone(jsonData)
    const existingProjects = ProjectStore.listProjects()
    if (existingProjects.includes(normalizedName)) {
      importedProjectData.value = admittedData
      conflictProjectName.value = normalizedName
      showImportConflictDialog.value = true
    } else {
      return processImport(admittedData, normalizedName)
    }
  }

  async function processImport(jsonData, finalName) {
    try {
      const name = normalizeProjectName(finalName, '')
      const opened = await importIntoSession(jsonData, name)
      if (!opened) return false
      addLog('info', `Project imported: ${name}`, 'System')
      showAlert('Project imported', `Project "${name}" imported successfully!`)
      return true
    } catch (error) {
      addLog('error', `Failed to import project: ${error.message}`, 'System')
      showAlert('Import failed', `Failed to import project: ${error.message}`)
      return false
    }
  }

  function generateUniqueName(baseName) {
    const existingProjects = ProjectStore.listProjects()
    let counter = 2
    let uniqueName = `${baseName} ${counter}`
    
    while (existingProjects.includes(uniqueName)) {
      counter++
      uniqueName = `${baseName} ${counter}`
    }
    
    return uniqueName
  }

  async function handleImportConflictOverwrite() {
    showImportConflictDialog.value = false
    return processImport(importedProjectData.value, conflictProjectName.value)
  }

  async function handleImportConflictNewName() {
    showImportConflictDialog.value = false
    const uniqueName = generateUniqueName(conflictProjectName.value)
    return processImport(importedProjectData.value, uniqueName)
  }

  function cancelImportConflict() {
    showImportConflictDialog.value = false
    importedProjectData.value = null
    conflictProjectName.value = ''
  }

  function exportProject() {
    if (!currentProjectName.value) {
      showAlert('Export failed', 'No project to export. Please create or open a project first.')
      return
    }
    
    try {
      const projectData = serializeProjectData()
      const jsonString = JSON.stringify(projectData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const downloadLink = document.createElement('a')
      downloadLink.href = url
      downloadLink.download = `${currentProjectName.value}.json`
      downloadLink.style.display = 'none'
      
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      showAlert('Export failed', `Failed to export project: ${error.message}`)
    }
  }

  return {
    importProject,
    exportProject,
    validateAndProcessImport,
    generateUniqueName,
    handleImportConflictOverwrite,
    handleImportConflictNewName,
    cancelImportConflict
  }
}

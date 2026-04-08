Attribute VB_Name = "Other"

'


Sub UpdateCalcs()
Attribute UpdateCalcs.VB_ProcData.VB_Invoke_Func = "A\n14"
If Len(SheetName) > 4 Then Exit Sub
    CreateConsumptionComments
    PrepaidCheck
End Sub

Sub PrepaidCheck()

   ' Range("E14:AZ300").ClearComments
    
    If Len(SheetName) > 4 Then Exit Sub
    
    Dim ThisData As Double
    Dim UnitData As String
    Dim LastReading As Double
    
    FirstDataRow = 14
    ThisRow = FirstDataRow
    PrepaidCol = 2
    FirstDataCol = 5
    CurrentDataCol = FirstDataCol
    ThisColor = 15
    UnitData = Cells(ThisRow, 1)
    
    While UnitData > ""
    
        LastReading = Cells(ThisRow, PrepaidCol)
        ThisData = Cells(ThisRow, CurrentDataCol)
        
        LastCol = Cells(ThisRow, Columns.Count).End(xlToLeft).Column
        
        While CurrentDataCol <= LastCol
        
            If ThisData > LastReading And LastReading <> 0 Then
            
                Cells(ThisRow, CurrentDataCol).Interior.ColorIndex = ThisColor
                Else
                Cells(ThisRow, CurrentDataCol).Interior.ColorIndex = 0
            
            End If
            
            CurrentDataCol = CurrentDataCol + 1
            ThisData = Cells(ThisRow, CurrentDataCol)
        
        Wend
        CurrentDataCol = FirstDataCol
        ThisRow = ThisRow + 1
        UnitData = Cells(ThisRow, 1)
        
     Wend

End Sub

Sub Difference()
Attribute Difference.VB_ProcData.VB_Invoke_Func = "D\n14"
'
' Difference Macro
'
' Keyboard Shortcut: Ctrl+Shift+D
    On Error Resume Next
    a = Selection.Cells(1)
    B = Selection.Cells(2)
    Dim Title As String
    Title = "The difference is:"
    Ans = MsgBox(B - a, vbOKOnly, Title)
    
End Sub
 
Sub CreateConsumptionComments()
Attribute CreateConsumptionComments.VB_ProcData.VB_Invoke_Func = "C\n14"
    SheetName = ActiveSheet.Name
    If Len(SheetName) > 3 Then Exit Sub
    Dim cmt As Comment
    Range("E14:AZ300").ClearComments
'  Find start column of reading
    Index = FindRow(1, "Electricity")
    RowIndex = Index + 1
    
    '   ---------------------------------------------
    Dim CellContent As Double
    Dim PrevCellContent As Double
    Dim ThisComment, ThisDate As String
    Dim UnitsUsed As Double
    
    UnitName = Cells(RowIndex, 1).Value
    While UnitName > ""
    
        ColIndex = 6
        CellContent = Cells(RowIndex, ColIndex).Value
        
        While CellContent > 0
        
            PrevCellContent = Cells(RowIndex, ColIndex - 1).Value
            UnitsUsed = CellContent - PrevCellContent
        
            Cells(RowIndex, ColIndex).ClearComments
            Cells(RowIndex, ColIndex).AddComment
            Cells(RowIndex, ColIndex).Comment.Visible = False
            
            ThisDate = Cells(1, ColIndex).Value
          '  ThisComment = "Unit: " & UnitName & vbCrLf & "Date: " & ThisDate & vbCrLf & "(" & CellContent & "-" & PrevCellContent & ")" & vbCrLf & UnitsUsed & " consumed"
             ThisComment = "Reading: " & CellContent & vbCrLf & "Used: " & UnitsUsed
           
            Set cmt = Sheets(SheetName).Cells(RowIndex, ColIndex).Comment
            If cmt Is Nothing Then
                Cells(RowIndex, ColIndex).AddComment Text:=ThisComment
              Else
                Cells(RowIndex, ColIndex).Comment.Text Text:=ThisComment
            End If
            ColIndex = ColIndex + 1
            CellContent = Cells(RowIndex, ColIndex).Value
        Wend
        RowIndex = RowIndex + 1
        UnitName = Cells(RowIndex, 1).Value
    Wend

End Sub

Sub ClearAllChecks()
'  Ans = MsgBox("Are you sure you want to do this?", vbYesNoCancel, "CLEAR ALL CHECKS")
'   If Ans <> vbYes Then Exit Sub
    Dim CB As CheckBox
    For Each CB In ActiveSheet.CheckBoxes
            CB.Value = False
    Next
End Sub

Sub CheckAllBoxes()
    
'    Ans = MsgBox("Are you sure you want to do this?", vbYesNoCancel)
'    If Ans <> vbYes Then Exit Sub
    Dim CB As CheckBox
     
    For Each CB In ActiveSheet.CheckBoxes
        If CB.Name <> ActiveSheet.CheckBoxes("Check Box 21").Name Then
            CB.Value = ActiveSheet.CheckBoxes("Check Box 21").Value
        End If
    Next

End Sub

Function CheckFileIsOpen(chkSumfile As String) As Boolean
    On Error Resume Next
    CheckFileIsOpen = (Workbooks(chkSumfile).Name = chkSumfile)
    On Error GoTo 0
End Function

Sub ClearGHTemplate()
    Range("D4:D6,D8:D11,D13:D21,D22,D23,D25:D30,D32:D39,D41").ClearContents
End Sub

Sub CopyGHTemplateData()
    Range("D4,D7,D12,D13:D21,D24,D25:D28,D31,D32:D39,D40,D41").Copy
    Range("T4").Select
    Selection.PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
    Application.CutCopyMode = False
    Selection.Copy
      
    Sheets("GH Template").Visible = False
    Sheets("GH").Visible = True
    Sheets("GH").Select
End Sub

Sub GotoGHTemplate()
    Sheets("GH Template").Visible = True
    Sheets("GH Template").Select
    Range("D4").Select
End Sub


Function DeleteSheet(SheetName As String)
    For Each sHEET In ActiveWorkbook.Worksheets
        If sHEET.Name = SheetName Then
            Application.DisplayAlerts = False
            Worksheets(SheetName).Delete
            Application.DisplayAlerts = True
        End If
    Next sHEET
End Function


Function FindRow(ByVal ThisCol, ByVal ThisText, Optional CaseSensitive As Boolean) As Integer

    If CaseSensitive = False Then ThisText = UCase(ThisText)
    
    Index = 1   ' Sets the starting point of the Index
    If CaseSensitive = False Then
        ThisCell = UCase(Cells(Index, 1))
        Else
        ThisCell = Cells(Index, 1)
    End If
    
   
    While ThisCell <> ThisText
        Index = Index + 1                   ' Steps the Index down the line looking for the START
        If CaseSensitive = False Then
            ThisCell = UCase(Cells(Index, 1))
            Else
            ThisCell = Cells(Index, 1)
        End If
        
        If Index = 500 Then FindRow = 0
    Wend
    FindRow = Index

End Function


Function FindCol(ByVal ThisRow, ByVal ThisText, Optional CaseSensitive As Boolean) As Integer

    If CaseSensitive = False Then ThisText = UCase(ThisText)
    
    Index = ThisRow   ' Sets the starting point of the Index
    If CaseSensitive = False Then
        ThisCell = UCase(Cells(1, Index))
        Else
        ThisCell = Cells(1, Index)
    End If
    
   
    While ThisCell <> ThisText
        Index = Index + 1                   ' Steps the Index down the line looking for the START
        If CaseSensitive = False Then
            ThisCell = UCase(Cells(1, Index))
            Else
            ThisCell = Cells(1, Index)
        End If
        
        If Index = 500 Then FindRow = 0
    Wend
    FindRow = Index

End Function


 
Sub PlusVAT()
Dim Incl As String
    SheetName = ActiveSheet.Name   ' Get Current Sheet
    ThisCol = ActiveCell.Column
    ThisRow = ActiveCell.Row
  
  Excl = Sheets(SheetName).Cells(ThisRow, ThisCol)
  Incl = Excl * 1.15
  
 ' MsgBox (Incl)
  CopyText Incl
  
End Sub


Sub CopyText(Text As String)
    'VBA Macro using late binding to copy text to clipboard.
    'By Justin Kay, 8/15/2014
    Dim MSForms_DataObject As Object
    Set MSForms_DataObject = CreateObject("new:{1C3B4210-F441-11CE-B9EA-00AA006B1A69}")
    MSForms_DataObject.SetText Text
    MSForms_DataObject.PutInClipboard
    Set MSForms_DataObject = Nothing
End Sub



Sub Pause(sec As Single)
    Dim StartTime As Single
    StartTime = Timer
    Do
         
    Loop While StartTime + sec > Timer
    'DoEvents
End Sub


Function SheetExists(shtName As String, Optional wb As Workbook) As Boolean
    Dim sht As Worksheet

     If wb Is Nothing Then Set wb = ThisWorkbook
     On Error Resume Next
     Set sht = wb.Sheets(shtName)
     On Error GoTo 0
     WorksheetExists = Not sht Is Nothing
     
 End Function

Sub UnHideAll()
'
' UnHideAll Macro

'
    Cells.Select
    Selection.EntireColumn.Hidden = False
    Selection.EntireRow.Hidden = False
    Range("J12").Select
    Sheets("Settings").Select
    ActiveSheet.Shapes.Range(Array("Rounded Rectangle 1")).Select
    Application.GoTo Reference:="UPLOADING_TO_CLOUD"
    ActiveSheet.Shapes.Range(Array("Rounded Rectangle 12")).Select
    Application.GoTo Reference:="DOWNLOADING_FROM_CLOUD"
    ActiveWorkbook.Save
    Range("D4").Select
    Sheets("Tariffs").Select
    Columns("I:J").Select
    Selection.EntireColumn.Hidden = True
    Range("N12").Select
    Sheets("Settings").Select
End Sub
 


Sub ClearImmediate()
     
    For t = 1 To 200
      Debug.Print ""
    Next
     
End Sub

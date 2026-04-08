Attribute VB_Name = "Module1"
Sub Lock_ON()
Attribute Lock_ON.VB_ProcData.VB_Invoke_Func = "j\n14"
'
' Lock_All Macro
'
' Keyboard Shortcut: Ctrl+Shift+L
'
Dim selectedCell As Range
Set selectedCell = Selection

ThisRow = selectedCell.Row
ThisCol = selectedCell.Column
    ActiveSheet.Unprotect
    If ThisRow = 1 Then
        Columns(ThisCol).Select
        Dim patternValue As Long
        patternValue = selectedCell.Interior.Pattern
        If patternValue <> xlGray8 Then
            Selection.Interior.Pattern = xlGray8
            Selection.Locked = False
        Else
            Cells.Select
            Selection.Interior.Pattern = xlSolid
            Selection.Locked = True
        End If
    Else
        Cells.Select
        Selection.Interior.Pattern = xlSolid
        Selection.Locked = True
    End If
        
    Cells(ThisRow, ThisCol).Select
    ActiveSheet.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True

End Sub


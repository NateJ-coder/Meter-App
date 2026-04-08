Attribute VB_Name = "I_Importing"
Dim RawData(500) As String
Dim UnitTitles(500) As String
Dim InputCount As Integer
Dim WaterStart As Integer
Dim ThisRow, ThisCol As Double
Dim TitleCount As Integer
Sub ImportData()

    RemCurrentSheet = ActiveSheet.Name
    Application.ScreenUpdating = False
    ThisCol = ActiveCell.Column
        
    If ThisCol < 4 Then
        Ans = MsgBox("Select a Month Column", vbExclamation, "Selection out of range")
        Exit Sub
    End If
    
    ThisRow = ActiveCell.Row
    If ThisRow <> 1 Then
        Ans = MsgBox("Select a Month in the 3rd Row", vbExclamation, "Selection out of range")
        Exit Sub
    End If
    
    BuildingName = Cells(1, 1)

    ReadData        ' Loads Data into RawData(Array)
    LoadUnitTitles  ' Read Unit Names
    
    Dim foundCell As Range
    
    
    For DataLine = 1 To InputCount
    
        InputLine = RawData(DataLine)
        FindSplit = InStr(InputLine, ",")
        If FindSplit = 0 Then GoTo NextLine
        DataTitle = Mid(InputLine, 1, FindSplit - 1)
        DataValue = Mid(InputLine, FindSplit + 1)
    
    ' ----------------------------
     
        FindThis = DataTitle
        FoundCell = sHEET(This Range("A1:A500").Find(What:=FindThis)
            
            If Not foundCell Is Nothing Then
                MsgBox (WHAT_TO_FIND & " found in row: " & foundCell.Row)
            Else
                MsgBox (WHAT_TO_FIND & " not found")
            End If
    

NextLine:
    
    Next
 
    
End Sub

Sub LoadUnitTitles()

    ' Search for "ELECTRICITY" to start
    Index = FindRow(1, "ELECTRICITY")
    ThisUtility = "ELECTRICITY"
    
    ' --------------------------------------------------------------------------------
    
    Index = Index + 1       ' The START has been found, so now it goes to the next line to read the first "Real" data entry
    ThisCell = UCase(Cells(Index, 1))   ' Reads each entry
    
    TitleCount = 0
    
    While ThisUtility = "ELECTRICITY"
        TitleCount = TitleCount + 1
        UnitTitles(TitleCount) = ThisUtility & ":" & ThisCell
        
        Index = Index + 1                   ' Steps the Index down the line looking for the START
        ThisCell = UCase(Cells(Index, 1))   ' Reads each entry
        If ThisCell = "WATER" Then ThisUtility = "WATER"
    Wend

        Index = Index + 1                   ' Steps the Index down the line looking for the START
        ThisCell = UCase(Cells(Index, 1))   ' Reads each entry
     
    While ThisCell <> ""
        TitleCount = TitleCount + 1
        UnitTitles(TitleCount) = ThisUtility & ":" & ThisCell
        TitleCount = Index
        Index = Index + 1                   ' Steps the Index down the line looking for the START
        ThisCell = UCase(Cells(Index, 1))   ' Reads each entry
         
    Wend


End Sub

Sub ReadData()

    Dim LocalFolderName, Filename, ThisDate, PathFilename As String
    LocalFolderName = Sheets("Settings").Cells(5, 3) & "\" & BuildingName & "\"
    
    ThisDate = Cells(ThisRow, ThisCol)
    Filename = Format(ThisDate, "YYYY-MM") & " " & BuildingName & ".csv"
    PathFilename = LocalFolderName & Filename
    Prefix = "ELECTRICITY:"
    If fileExists(PathFilename) Then
        Dim InputText As String
        InputCount = 0
        Open PathFilename For Input As #1   ' Open file for input.
            Do While Not EOF(1)                 ' Loop until end of file.
                Line Input #1, InputText        ' Read next line from file and add text to the array
                InputText = UCase(Replace(InputText, Chr$(34), ""))
                If InStr(InputText, "WATER") > 0 Then
                    Prefix = "WATER:"
                    WaterStart = InputCount
                End If
                RawData(InputCount) = Prefix & InputText
                InputCount = InputCount + 1
            Loop
        Close #1
  End If
  
End Sub

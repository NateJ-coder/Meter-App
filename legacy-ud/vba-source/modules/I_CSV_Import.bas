Attribute VB_Name = "I_CSV_Import"
Sub ImportX()
    
'    MsgBox ("Import Feature is currently being modified")
'    Exit Sub
    
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
    Dim LocalFolderName, Filename, ThisDate, PathFilename As String
    LocalFolderName = Sheets("Settings").Cells(5, 3) & "\" & BuildingName & "\"
    
    ThisDate = Cells(ThisRow, ThisCol)
    Filename = Format(ThisDate, "YYYY-MM") & " " & BuildingName & ".csv"
    PathFilename = LocalFolderName & Filename
    
    If fileExists(LocalFolderName & Filename) Then
       
        '  Read data into an array or list of some sort

        Dim ThisList(1000) As String
        Dim InputText As String
        Dim InputCount As Integer
        InputCount = 0
        Open PathFilename For Input As #1 ' Open file for input.
        Do While Not EOF(1) ' Loop until end of file.
         
            Line Input #1, InputText ' read next line from file and add text to the array
            InputText = Replace(InputText, Chr$(34), "")
            
            ThisList(InputCount) = InputText
            InputCount = InputCount + 1
        Loop
        Close #1
        
        ' Detect where Electricity BULK meters start and end
        ' Detect where Electricity UNIT meters start and end
        
        Dim ElectricBULKStart As Integer
        Dim ElectricBULKEnd As Integer
        Dim ElectricUNITStart As Integer
        Dim ElectricUNITEnd As Integer
        
        Dim Utility As String
        Dim FoundIt As Integer
        ElectricBULKStart = 0
        
            Dim ThisData As Variant
            For t = 0 To InputCount
            
                ThisData = UCase(ThisList(t))
                            
                If InStr(1, ThisData, "ELECTRICITY") > 0 Then
                    Utility = "ELECTRICITY"
                    FirstDataRow = t
                Else
                    If InStr(1, ThisData, "WATER") > 0 Then
                        Utility = "WATER"
                    Else
                        If Utility = "ELECTRICITY" Then     ' ----------------------------------- ELECTRICITY
                            f = InStr(1, ThisData, "BULK")
                            If f > 0 Then
                                If ElectricBULKStart = 0 Then
                                    ElectricBULKStart = t
                                Else
                                    ElectricBULKEnd = t
                                End If
                            Else
                                If ElectricBULKEnd = 0 Then ElectricBULKEnd = t
                            
                                If ElectricUNITStart = 0 Then
                                    ElectricUNITStart = t
                                Else
                                    ElectricUNITEnd = t
                                End If
                            End If
                        End If
                        
                        If Utility = "WATER" Then       ' ------------------------------------ WATER
                            f = InStr(1, ThisData, "BULK")
                            If f > 0 Then
                                If WaterBULKStart = 0 Then
                                    WaterBULKStart = t
                                Else
                                    WaterBULKEnd = t
                                End If
                            Else
                                If WaterBULKEnd = 0 Then WaterBULKEnd = t
                                If WaterUNITStart = 0 Then
                                    WaterUNITStart = t
                                Else
                                    WaterUNITEnd = t
                                End If
                                
                            End If
                        End If
                        
                     End If
                    
                End If
            
            Next

        ' Copy Array to Sheet ------------------------------------------------------------------
        
         '  Electricity Bulk Top from Sheet = ?
        Dim ElecTop As Integer:
        Dim Count As Integer: Count = 0
        Dim ThisDat As String
        Dim Reading As String
        Dim ComPos As Integer
        
    ' Trasfer Electric BULK -----------------------------------------------------
         Set FindRow = Sheets(RemCurrentSheet).Range("A:A").Find(What:="BULK", LookIn:=xlValues)
        
        ElecTop = FindRow.Row + 1
        
        Count = 0
        For t = ElectricBULKStart To ElectricBULKEnd - 1
            ThisDat = ThisList(t)
            ComPos = InStr(1, ThisDat, ",") + 1
            Reading = Mid(ThisDat, ComPos)
            Sheets(RemCurrentSheet).Cells(ElecTop + Count, ThisCol) = Reading
            Count = Count + 1
        Next
    
    ' Transfer Electric UNITS -----------------------------------------------------
        Set FindRow = Sheets(RemCurrentSheet).Range("A:A").Find(What:="ELECTRICITY", LookIn:=xlValues)
        ElecTop = FindRow.Row + 1
        Count = 0
        For t = ElectricUNITStart To ElectricUNITEnd - 1
            ThisDat = ThisList(t)
            ComPos = InStr(1, ThisDat, ",") + 1
            Reading = Mid(ThisDat, ComPos)
            Sheets(RemCurrentSheet).Cells(ElecTop + Count, ThisCol) = Reading
            Count = Count + 1
        Next
            
    ' Transfer Water BULK -----------------------------------------------------
    If WaterBULKStart > 0 Then
        Set FindRow = Sheets(RemCurrentSheet).Range("A:A").Find(What:="WATER", LookIn:=xlValues)
        ElecTop = FindRow.Row + 1
        Count = 0
        For t = WaterBULKStart - 1 To WaterBULKEnd - 1
            ThisDat = ThisList(t)
            ComPos = InStr(1, ThisDat, ",") + 1
            Reading = Mid(ThisDat, ComPos)
            Sheets(RemCurrentSheet).Cells(wATERTop + Count, ThisCol) = Reading
            Count = Count + 1
        Next
    End If
    
    ' Trasfer Water UNITS -----------------------------------------------------
    If WaterUNITStart > 0 Then
        Set FindRow = Sheets(RemCurrentSheet).Range("A:A").Find(What:="WATER", LookIn:=xlValues)
        ElecTop = FindRow.Row + 1
        Count = 0
        For t = WaterUNITStart To WaterUNITEnd - 1
            ThisDat = ThisList(t)
            ComPos = InStr(1, ThisDat, ",") + 1
            Reading = Mid(ThisDat, ComPos)
            Sheets(RemCurrentSheet).Cells(ElecTop + Count, ThisCol) = Reading
            Count = Count + 1
        Next
    End If
        
    End If
    Application.ScreenUpdating = True

End Sub


' Check if a file exists
Function fileExists(Filename As String) As Boolean

    Dim Obj As Object
    Set Obj = CreateObject("Scripting.FileSystemObject")
    fileExists = Obj.fileExists(Filename)
  
End Function



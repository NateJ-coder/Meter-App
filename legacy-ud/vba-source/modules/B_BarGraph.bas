Attribute VB_Name = "B_BarGraph"
Sub GotoChart()
Attribute GotoChart.VB_ProcData.VB_Invoke_Func = "Z\n14"

    SheetName = ActiveSheet.Name   ' Get Current Sheet
    ThisCol = ActiveCell.Column
    ThisRow = ActiveCell.Row
    ChartSheet = "UnitHistory"
    
If SheetName = ChartSheet Then
    On Error GoTo Skipit:
    Sheets(LastBuilding).Select
    Exit Sub
Skipit:
End If
    
    Sheets(ChartSheet).Range("GraphData").ClearContents
    
    GraphElecCol = Sheets(ChartSheet).Range("TopofGraphDataElec").Column
    GraphElecRow = Sheets(ChartSheet).Range("TopofGraphDataElec").Row
  
    Sheets(ChartSheet).Visible = True
    Sheets(ChartSheet).Select
    
    FromCol = ThisCol - 12
    If FromCol < 5 Then FromCol = 5
    
    GraphTitle = Sheets(SheetName).Cells(ThisRow, 1) & " " & Sheets(SheetName).Cells(1, 1)
    
    Sheets(ChartSheet).Cells(1, 1) = GraphTitle
    
    For i = FromCol + 1 To ThisCol
    
        StartReading = Sheets(SheetName).Cells(ThisRow, i).Value
        EndReading = Sheets(SheetName).Cells(ThisRow, i - 1).Value
        UnitsUsed = StartReading - EndReading
        ThisMonth = Sheets(SheetName).Cells(1, i).Value
        Sheets(ChartSheet).Cells(GraphElecRow, GraphElecCol - 1) = ThisMonth
        Sheets(ChartSheet).Cells(GraphElecRow, GraphElecCol) = UnitsUsed
        
        GraphElecRow = GraphElecRow + 1
        
    Next
    
    
    
End Sub


Sub BarGraphThis()
Attribute BarGraphThis.VB_ProcData.VB_Invoke_Func = " \n14"
    
        SheetName = ActiveSheet.Name   ' Get Current Sheet
        EndCol = ActiveCell.Column
        RemRow = ActiveCell.Row
    
        StartCol = EndCol - 12
        If StartCol < 5 Then StartCol = 5
        
       Dim OpenRead As Double
       Dim CloseRead As Double
       
       Dim RowOffset As Integer
       RowOffset = 6
       For i = RowOffset To RowOffset + 11: Sheets("UnitHistory").Cells(i, 3) = 0: Next i
       
       Sheets("UnitHistory").Activate
    
       OpenRead = Sheets(SheetName).Cells(RemRow, StartCol).Value
       For i = StartCol + 1 To EndCol
            
            CloseRead = Sheets(SheetName).Cells(RemRow, i).Value
            
            If OpenRead = 0 Or CloseRead = 0 Then
                Sheets("UnitHistory").Cells(RowOffset, 3) = 0
            Else
                Sheets("UnitHistory").Cells(RowOffset, 3) = CloseRead - OpenRead
            End If
            
            OpenRead = CloseRead
            RowOffset = RowOffset + 1
        Next i

    Sheets("UnitHistory").Visible = True
    Sheets("UnitHistory").Select

End Sub
